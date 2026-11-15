-- Freerange creators: verified-creator badges, ESA vendor status, and
-- storefronts with followers.
--
-- Creators apply (who they are, a website or portfolio, how they made their
-- curricula; or for ESA, the states and vendor IDs they're approved under).
-- Moderators approve or decline. The badges live on the creator's profile and
-- are copied onto every listing they sell, by triggers: a creator can never
-- set them, and neither can a family seller. No tax IDs or bank details are
-- collected; state program enrollment happens outside Freerange.

-- ───────────────────────────── Badges on creator profiles

alter table public.creator_profiles
  add column verified boolean not null default false,
  add column verified_at timestamptz,
  add column esa_states text[] not null default '{}';

-- 50 states + DC.
create or replace function public.us_state_codes()
returns text[]
language sql immutable
as $$
  select array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
$$;

-- Only moderation (freerange.moderating) or the service role sets badges.
create or replace function public.creator_profiles_badge_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or coalesce(current_setting('freerange.moderating', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verified := false;
    new.verified_at := null;
    new.esa_states := '{}';
  else
    new.verified := old.verified;
    new.verified_at := old.verified_at;
    new.esa_states := old.esa_states;
    -- The badge vouches for who's behind this name; a new name needs a new check.
    if old.verified and new.name is distinct from old.name then
      new.verified := false;
      new.verified_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger creator_profiles_badge_guard before insert or update on public.creator_profiles
  for each row execute function public.creator_profiles_badge_guard();

-- ───────────────────────────── Badges on listings (always derived)

-- Which states the seller is an approved ESA vendor in (families see these).
alter table public.listings add column esa_states text[] not null default '{}';

-- Runs after listings_protect (triggers fire by name). Creator listings take
-- their badges from the creator's profile; nobody else's can gain ESA states.
create or replace function public.listings_seller_badges()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.creator_profiles;
begin
  if new.creator_user is not null then
    select * into prof from public.creator_profiles where user_id = new.creator_user;
    new.seller_verified := coalesce(prof.verified, false);
    new.esa_states := coalesce(prof.esa_states, '{}');
    new.esa_eligible := cardinality(new.esa_states) > 0;
  elsif auth.uid() is not null then
    new.esa_states := case when tg_op = 'UPDATE' then old.esa_states else '{}' end;
  end if;
  return new;
end;
$$;
create trigger listings_seller_badges before insert or update on public.listings
  for each row execute function public.listings_seller_badges();

-- A profile change reaches the creator's listings: badges and the seller name.
create or replace function public.creator_profiles_refresh_listings()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.verified is distinct from old.verified or new.esa_states is distinct from old.esa_states or new.name is distinct from old.name then
    update public.listings set seller_name = new.name where creator_user = new.user_id;
  end if;
  return null;
end;
$$;
create trigger creator_profiles_refresh_listings after update on public.creator_profiles
  for each row execute function public.creator_profiles_refresh_listings();

-- ───────────────────────────── Applications

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  badge text not null check (badge in ('verified', 'esa')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'revoked')),
  seller_type text not null default 'creator' check (seller_type in ('creator', 'publisher')),
  -- Verified: the person or organization behind the shop. ESA: the business name as on a W-9.
  legal_name text not null check (char_length(legal_name) between 2 and 120),
  website text check (website is null or (website ~* '^https?://' and char_length(website) <= 500)),
  -- Verified: how they made their curricula. ESA: anything else moderators should know.
  about text not null default '' check (char_length(about) <= 3000),
  sample_url text check (sample_url is null or (sample_url ~* '^https?://' and char_length(sample_url) <= 500)),
  states text[] not null default '{}' check (states <@ public.us_state_codes()),
  -- ESA vendor IDs or links to the state program's vendor listing.
  vendor_info text not null default '' check (char_length(vendor_info) <= 2000),
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index seller_applications_pending_idx on public.seller_applications (user_id, badge) where status = 'pending';
create index seller_applications_queue_idx on public.seller_applications (status, created_at);
alter table public.seller_applications enable row level security;
create policy "creators see their applications" on public.seller_applications
  for select to authenticated using (user_id = auth.uid());
grant select on public.seller_applications to authenticated;
-- Written only through the functions below.

-- Something shaped like a tax ID: an SSN or EIN, with or without dashes
-- (mirrors looksLikeTaxId() in the app).
create or replace function public.looks_like_tax_id(t text)
returns boolean
language sql immutable
as $$
  select coalesce(t, '') ~ '\m\d{3}-\d{2}-\d{4}\M' or coalesce(t, '') ~ '\m\d{2}-\d{7}\M' or coalesce(t, '') ~ '\m\d{9}\M'
$$;

-- Apply (or update a pending application) for a badge.
create or replace function public.apply_for_badge(badge text, details jsonb)
returns public.seller_applications
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prof public.creator_profiles;
  a public.seller_applications;
  v_name text := btrim(coalesce(details ->> 'legalName', ''));
  v_site text := nullif(btrim(coalesce(details ->> 'website', '')), '');
  v_about text := btrim(coalesce(details ->> 'about', ''));
  v_sample text := nullif(btrim(coalesce(details ->> 'sampleUrl', '')), '');
  v_vendor text := btrim(coalesce(details ->> 'vendorInfo', ''));
  v_type text := coalesce(details ->> 'sellerType', 'creator');
  v_states text[] := coalesce((select array_agg(distinct upper(x) order by upper(x)) from jsonb_array_elements_text(coalesce(details -> 'states', '[]'::jsonb)) x), '{}');
begin
  if uid is null then
    raise exception 'Sign in to apply' using errcode = '42501';
  end if;
  select * into prof from public.creator_profiles where user_id = uid;
  if not found then
    raise exception 'Set up your creator profile first' using errcode = '22023';
  end if;
  if badge not in ('verified', 'esa') or v_type not in ('creator', 'publisher') then
    raise exception 'Unknown badge' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Add your name or business name' using errcode = '22023';
  end if;
  if public.looks_like_tax_id(v_name) or public.looks_like_tax_id(v_vendor) or public.looks_like_tax_id(v_about) then
    raise exception 'Leave out tax ID, Social Security, and bank numbers. Freerange doesn''t collect them' using errcode = '22023';
  end if;
  if badge = 'verified' then
    if prof.verified then
      raise exception 'You''re already a verified creator' using errcode = '22023';
    end if;
    if v_site is null then
      raise exception 'Add your website or portfolio' using errcode = '22023';
    end if;
    if char_length(v_about) < 20 then
      raise exception 'Tell us how you made your curricula' using errcode = '22023';
    end if;
  else
    if cardinality(v_states) = 0 then
      raise exception 'Choose the states you''re an approved vendor in' using errcode = '22023';
    end if;
    if not (v_states <@ public.us_state_codes()) then
      raise exception 'Unknown state' using errcode = '22023';
    end if;
    if char_length(v_vendor) < 3 then
      raise exception 'Add your vendor IDs or links to the state programs'' vendor listings' using errcode = '22023';
    end if;
  end if;

  update public.seller_applications s
     set seller_type = v_type, legal_name = v_name, website = v_site, about = left(v_about, 3000), sample_url = v_sample,
         states = case when apply_for_badge.badge = 'esa' then v_states else '{}' end, vendor_info = left(v_vendor, 2000), updated_at = now()
   where s.user_id = uid and s.badge = apply_for_badge.badge and s.status = 'pending'
  returning * into a;
  if not found then
    insert into public.seller_applications (user_id, badge, seller_type, legal_name, website, about, sample_url, states, vendor_info)
    values (uid, apply_for_badge.badge, v_type, v_name, v_site, left(v_about, 3000), v_sample, case when apply_for_badge.badge = 'esa' then v_states else '{}' end, left(v_vendor, 2000))
    returning * into a;
  end if;
  return a;
end;
$$;
revoke all on function public.apply_for_badge(text, jsonb) from public, anon;
grant execute on function public.apply_for_badge(text, jsonb) to authenticated;

create or replace function public.withdraw_badge_application(badge text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.seller_applications s set status = 'withdrawn', updated_at = now()
   where s.user_id = auth.uid() and s.badge = withdraw_badge_application.badge and s.status = 'pending';
end;
$$;
revoke all on function public.withdraw_badge_application(text) from public, anon;
grant execute on function public.withdraw_badge_application(text) to authenticated;

-- Pending applications, oldest first, with the creator's profile (moderators only).
create or replace function public.badge_queue()
returns table (
  id uuid, user_id uuid, badge text, seller_type text, legal_name text, website text, about text, sample_url text,
  states text[], vendor_info text, created_at timestamptz, creator_name text, creator_bio text, creator_website text,
  verified boolean, esa_states text[], listing_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  return query
  select a.id, a.user_id, a.badge, a.seller_type, a.legal_name, a.website, a.about, a.sample_url, a.states, a.vendor_info, a.created_at,
         p.name, p.bio, p.website, p.verified, p.esa_states,
         (select count(*) from public.listings l where l.creator_user = a.user_id and l.status = 'active')
    from public.seller_applications a
    join public.creator_profiles p on p.user_id = a.user_id
   where a.status = 'pending'
   order by a.created_at;
end;
$$;
revoke all on function public.badge_queue() from public, anon;
grant execute on function public.badge_queue() to authenticated;

-- approve or decline a pending application.
create or replace function public.decide_badge(app uuid, decision text, note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.seller_applications;
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  if decision not in ('approve', 'decline') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  select * into a from public.seller_applications where id = app and status = 'pending' for update;
  if not found then
    raise exception 'That application was already decided' using errcode = 'P0002';
  end if;
  if decision = 'approve' then
    perform set_config('freerange.moderating', 'on', true);
    if a.badge = 'verified' then
      update public.creator_profiles set verified = true, verified_at = now() where user_id = a.user_id;
    else
      update public.creator_profiles set esa_states = a.states where user_id = a.user_id;
    end if;
    perform set_config('freerange.moderating', 'off', true);
  end if;
  update public.seller_applications
     set status = case when decision = 'approve' then 'approved' else 'declined' end,
         decision_note = nullif(left(btrim(coalesce(note, '')), 1000), ''), decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = a.id;
end;
$$;
revoke all on function public.decide_badge(uuid, text, text) from public, anon;
grant execute on function public.decide_badge(uuid, text, text) to authenticated;

-- Take a badge away (e.g. a verified creator turned out to be someone else).
create or replace function public.revoke_badge(creator uuid, badge text, note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  if badge not in ('verified', 'esa') then
    raise exception 'Unknown badge' using errcode = '22023';
  end if;
  perform set_config('freerange.moderating', 'on', true);
  if badge = 'verified' then
    update public.creator_profiles set verified = false, verified_at = null where user_id = creator;
  else
    update public.creator_profiles set esa_states = '{}' where user_id = creator;
  end if;
  perform set_config('freerange.moderating', 'off', true);
  update public.seller_applications s
     set status = 'revoked', decision_note = nullif(left(btrim(coalesce(note, '')), 1000), ''), decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where s.user_id = creator and s.badge = revoke_badge.badge and s.status = 'approved';
end;
$$;
revoke all on function public.revoke_badge(uuid, text, text) from public, anon;
grant execute on function public.revoke_badge(uuid, text, text) to authenticated;

-- ───────────────────────────── Followers

create table public.creator_follows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creator_user uuid not null references public.creator_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, creator_user),
  check (user_id <> creator_user)
);
create index creator_follows_creator_idx on public.creator_follows (creator_user);
alter table public.creator_follows enable row level security;
-- Who follows whom stays private: people see only their own follows.
create policy "people see who they follow" on public.creator_follows
  for select to authenticated using (user_id = auth.uid());
create policy "people follow creators" on public.creator_follows
  for insert to authenticated with check (user_id = auth.uid());
create policy "people unfollow creators" on public.creator_follows
  for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.creator_follows to authenticated;

-- How many people follow the signed-in creator (for Studio).
create or replace function public.my_follower_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.creator_follows where creator_user = auth.uid();
$$;
revoke all on function public.my_follower_count() from public, anon;
grant execute on function public.my_follower_count() to authenticated;
