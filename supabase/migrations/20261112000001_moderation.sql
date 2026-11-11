-- Freerange moderation: anyone signed in can report a listing or review
-- (including copyright claims); moderators review a queue and hide, restore,
-- or dismiss. Three different people reporting the same thing hides it until
-- a moderator looks. Sellers can't undo a moderator's decision.

-- ───────────────────────────── Moderators

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies: only the functions below read it. Add moderators with
--   insert into public.app_admins (user_id) values ('<auth user id>');

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ───────────────────────────── Hidden listings and reviews

alter table public.listings drop constraint listings_status_check;
alter table public.listings add constraint listings_status_check check (status in ('active', 'removed', 'suspended'));

alter table public.reviews add column hidden boolean not null default false;
drop policy "anyone reads reviews" on public.reviews;
create policy "anyone reads reviews" on public.reviews
  for select to anon, authenticated using (not hidden or public.is_family_member(family_id));

-- Only moderation (which sets freerange.moderating) can suspend a listing or
-- lift a suspension — not the seller, and not republishing from Studio.
create or replace function public.listings_moderation_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('freerange.moderating', true), '') = 'on' then
    return new;
  end if;
  -- Stays suspended even if the seller removes it (removing and republishing
  -- would otherwise bring it back).
  if tg_op = 'UPDATE' and old.status = 'suspended' then
    new.status := 'suspended';
  elsif new.status = 'suspended' then
    new.status := case when tg_op = 'UPDATE' then old.status else 'active' end;
  end if;
  return new;
end;
$$;
create trigger listings_moderation_guard before insert or update on public.listings
  for each row execute function public.listings_moderation_guard();

create or replace function public.reviews_moderation_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('freerange.moderating', true), '') <> 'on' then
    new.hidden := case when tg_op = 'UPDATE' then old.hidden else false end;
  end if;
  return new;
end;
$$;
create trigger reviews_moderation_guard before insert or update on public.reviews
  for each row execute function public.reviews_moderation_guard();

-- Hidden reviews don't count toward a listing's rating.
create or replace function public.refresh_listing_rating()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  lid text := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings l
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.listing_id = lid and not r.hidden), 0),
         rating_count = (select count(*) from public.reviews r where r.listing_id = lid and not r.hidden)
   where l.id = lid;
  return null;
end;
$$;

-- ───────────────────────────── Reports

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('listing', 'review')),
  target_id text not null,
  listing_id text references public.listings (id) on delete cascade,
  reason text not null check (reason in ('copyright', 'inappropriate', 'spam', 'misleading', 'personal_info', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  -- How to reach the person claiming a copyright.
  contact text check (contact is null or char_length(contact) <= 200),
  reporter_user uuid references auth.users (id) on delete set null default auth.uid(),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  resolution text check (resolution is null or char_length(resolution) <= 500),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (target_kind, target_id, reporter_user)
);
create index reports_open_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
create policy "people see their own reports" on public.reports
  for select to authenticated using (reporter_user = auth.uid());
grant select on public.reports to authenticated;

-- Reports from this many different people hide the item until a moderator decides.
create or replace function public.report_auto_hide_threshold()
returns integer
language sql immutable
as $$ select 3 $$;

create or replace function public.report_content(kind text, target text, why text, info text default '', reach text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lid text;
  l public.listings;
  r public.reviews;
  reporters integer;
  hid boolean := false;
begin
  if uid is null then
    raise exception 'Sign in to report' using errcode = '42501';
  end if;
  if why = 'copyright' and (coalesce(btrim(info), '') = '' or coalesce(btrim(reach), '') = '') then
    raise exception 'Copyright reports need the original work and a way to reach you' using errcode = '22023';
  end if;
  if kind = 'listing' then
    select * into l from public.listings where id = target;
    if not found then
      raise exception 'That listing isn''t available' using errcode = 'P0002';
    end if;
    if public.is_family_member(l.seller_family) or l.creator_user = uid then
      raise exception 'You can''t report your own listing' using errcode = '42501';
    end if;
    lid := l.id;
  elsif kind = 'review' then
    select * into r from public.reviews where id = target;
    if not found then
      raise exception 'That review isn''t available' using errcode = 'P0002';
    end if;
    if public.is_family_member(r.family_id) then
      raise exception 'You can''t report your own review' using errcode = '42501';
    end if;
    lid := r.listing_id;
  else
    raise exception 'Unknown report' using errcode = '22023';
  end if;

  insert into public.reports (target_kind, target_id, listing_id, reason, details, contact, reporter_user)
  values (kind, target, lid, why, left(coalesce(info, ''), 2000), nullif(left(btrim(coalesce(reach, '')), 200), ''), uid)
  on conflict (target_kind, target_id, reporter_user) do update
    set reason = excluded.reason, details = excluded.details, contact = excluded.contact, status = 'open', created_at = now(),
        resolution = null, resolved_by = null, resolved_at = null;

  select count(distinct reporter_user) into reporters
    from public.reports where target_kind = kind and target_id = target and status = 'open';
  if reporters >= public.report_auto_hide_threshold() then
    perform set_config('freerange.moderating', 'on', true);
    if kind = 'listing' then
      update public.listings set status = 'suspended' where id = target and status = 'active';
    else
      update public.reviews set hidden = true where id = target;
    end if;
    perform set_config('freerange.moderating', 'off', true);
    hid := true;
  end if;
  return jsonb_build_object('hidden', hid);
end;
$$;
revoke all on function public.report_content(text, text, text, text, text) from public, anon;
grant execute on function public.report_content(text, text, text, text, text) to authenticated;

-- Everything with open reports, grouped per listing or review (moderators only).
create or replace function public.moderation_queue()
returns table (
  target_kind text, target_id text, listing_id text, title text, excerpt text, owner text,
  state text, reasons text[], report_count bigint, latest timestamptz, reports jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  return query
  select p.target_kind, p.target_id, p.listing_id,
         coalesce(l.title, ''),
         case when p.target_kind = 'review' then left(coalesce(nullif(rv.title, '') || ': ', '') || rv.body, 280) else left(coalesce(l.description, ''), 280) end,
         case when p.target_kind = 'review' then rv.author_name else l.seller_name end,
         case when p.target_kind = 'review' then (case when rv.hidden then 'hidden' else 'visible' end) else l.status end,
         array_agg(distinct p.reason order by p.reason),
         count(*),
         max(p.created_at),
         jsonb_agg(jsonb_build_object('reason', p.reason, 'details', p.details, 'contact', p.contact, 'at', p.created_at) order by p.created_at desc)
    from public.reports p
    left join public.listings l on l.id = p.listing_id
    left join public.reviews rv on p.target_kind = 'review' and rv.id = p.target_id
   where p.status = 'open'
   group by p.target_kind, p.target_id, p.listing_id, l.title, l.description, l.seller_name, l.status, rv.title, rv.body, rv.author_name, rv.hidden
   order by bool_or(p.reason = 'copyright') desc, max(p.created_at) desc;
end;
$$;
revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

-- hide: take it down; restore: put it back; dismiss: reports were wrong (and undo an automatic hide).
create or replace function public.moderate(kind text, target text, action text, note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  if action not in ('hide', 'restore', 'dismiss') or kind not in ('listing', 'review') then
    raise exception 'Unknown moderation action' using errcode = '22023';
  end if;
  perform set_config('freerange.moderating', 'on', true);
  if kind = 'listing' then
    update public.listings
       set status = case when action = 'hide' then 'suspended' when status = 'suspended' then 'active' else status end
     where id = target;
  else
    update public.reviews set hidden = (action = 'hide') where id = target;
  end if;
  perform set_config('freerange.moderating', 'off', true);
  update public.reports
     set status = case when action = 'hide' then 'actioned' else 'dismissed' end,
         resolution = left(coalesce(note, action), 500), resolved_by = auth.uid(), resolved_at = now()
   where target_kind = kind and target_id = target and status = 'open';
end;
$$;
revoke all on function public.moderate(text, text, text, text) from public, anon;
grant execute on function public.moderate(text, text, text, text) to authenticated;
