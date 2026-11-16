-- Studio & Community UX review (SC-05, SC-15).
--
-- 1. Families can be reported from the family finder and from a connection
--    request ("Report family"), not just one message at a time. Moderators see
--    the family's display name and bio and can hide the family from the
--    finder; the family is told, like for listings and messages.
-- 2. The finder says how long a family has been on Freerange ("On Freerange
--    since Nov 2026"), so lookalike display names are easier to tell apart,
--    and leaves out families a moderator hid.
-- 3. Field trips have a start time and an optional "details" note
--    (what to bring, where exactly to meet).

-- ───────────────────────────── 1. Reporting a family

alter table public.reports drop constraint reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check check (target_kind in ('listing', 'review', 'message', 'family'));
alter table public.moderation_events drop constraint moderation_events_target_kind_check;
alter table public.moderation_events add constraint moderation_events_target_kind_check
  check (target_kind in ('listing', 'review', 'message', 'family', 'verification'));

-- Set by moderators only: the family stays out of the finder until a moderator restores it.
alter table public.community_profiles add column moderator_hidden boolean not null default false;

create or replace function public.community_profiles_protect()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('freerange.moderating', true), '') <> 'on' then
    new.moderator_hidden := case when tg_op = 'INSERT' then false else old.moderator_hidden end;
  end if;
  return new;
end;
$$;
create or replace trigger community_profiles_protect before insert or update on public.community_profiles
  for each row execute function public.community_profiles_protect();

create or replace function public.report_content(kind text, target text, why text, info text default '', reach text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lid text;
  l public.listings;
  r public.reviews;
  msg public.messages;
  fam uuid;
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
  elsif kind = 'message' then
    -- Only the family that received it can report it.
    select * into msg from public.messages where id = public.as_uuid(target);
    if not found or not public.in_conversation(msg.conversation_id) then
      raise exception 'That message isn''t available' using errcode = 'P0002';
    end if;
    if public.is_family_member(msg.sender_family) then
      raise exception 'You can''t report your own message' using errcode = '42501';
    end if;
    if why = 'copyright' then
      raise exception 'Pick another reason for a message' using errcode = '22023';
    end if;
  elsif kind = 'family' then
    -- A family in the community (seen in the finder, or through a connection request).
    select p.family_id into fam from public.community_profiles p where p.family_id = public.as_uuid(target);
    if fam is null then
      raise exception 'That family isn''t available' using errcode = 'P0002';
    end if;
    if public.is_family_member(fam) then
      raise exception 'You can''t report your own family' using errcode = '42501';
    end if;
    if why = 'copyright' then
      raise exception 'Pick another reason for a family' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown report' using errcode = '22023';
  end if;

  insert into public.reports (target_kind, target_id, listing_id, reason, details, contact, reporter_user)
  values (kind, target, lid, why, left(coalesce(info, ''), 2000), nullif(left(btrim(coalesce(reach, '')), 200), ''), uid)
  on conflict (target_kind, target_id, reporter_user) do update
    set reason = excluded.reason, details = excluded.details, contact = excluded.contact, status = 'open', created_at = now(),
        resolution = null, resolved_by = null, resolved_at = null;

  -- Messages and families wait for a moderator (a family is never hidden by reports alone).
  if kind in ('message', 'family') then
    return jsonb_build_object('hidden', false);
  end if;
  select count(distinct reporter_user) into reporters
    from public.reports where target_kind = kind and target_id = target and status = 'open';
  if reporters >= public.report_auto_hide_threshold() then
    perform set_config('freerange.moderating', 'on', true);
    if kind = 'listing' then
      update public.listings set status = 'suspended' where id = target and status = 'active';
      if found and l.seller_family is not null then
        insert into public.moderation_events (family_id, target_kind, target_id, action, title)
        values (l.seller_family, 'listing', target, 'auto_hidden', left(l.title, 200));
      end if;
    else
      update public.reviews set hidden = true where id = target and not hidden;
      if found then
        insert into public.moderation_events (family_id, target_kind, target_id, action, title)
        values (r.family_id, 'review', target, 'auto_hidden', left(coalesce((select title from public.listings where id = r.listing_id), ''), 200));
      end if;
    end if;
    perform set_config('freerange.moderating', 'off', true);
    hid := true;
  end if;
  return jsonb_build_object('hidden', hid);
end;
$$;

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
         case p.target_kind
           when 'message' then 'Message from ' || coalesce(sp.display_name, 'a Freerange family')
           when 'family' then 'Family: ' || coalesce(fp.display_name, 'a Freerange family')
           else coalesce(l.title, '') end,
         case p.target_kind
           when 'review' then left(coalesce(nullif(rv.title, '') || ': ', '') || rv.body, 280)
           when 'message' then left(coalesce(ms.body, ''), 280)
           when 'family' then left(coalesce(fp.bio, ''), 280)
           else left(coalesce(l.description, ''), 280) end,
         case p.target_kind
           when 'review' then rv.author_name
           when 'message' then coalesce(sp.display_name, 'A Freerange family')
           when 'family' then coalesce(fp.display_name, 'A Freerange family')
           else l.seller_name end,
         case p.target_kind
           when 'review' then (case when rv.hidden then 'hidden' else 'visible' end)
           when 'message' then (case when ms.hidden then 'hidden' else 'visible' end)
           when 'family' then (case when fp.moderator_hidden then 'hidden' else 'visible' end)
           else l.status end,
         array_agg(distinct p.reason order by p.reason),
         count(*),
         max(p.created_at),
         jsonb_agg(jsonb_build_object('reason', p.reason, 'details', p.details, 'contact', p.contact, 'at', p.created_at) order by p.created_at desc)
    from public.reports p
    left join public.listings l on l.id = p.listing_id
    left join public.reviews rv on p.target_kind = 'review' and rv.id = p.target_id
    left join public.messages ms on p.target_kind = 'message' and ms.id = public.as_uuid(p.target_id)
    left join public.community_profiles sp on sp.family_id = ms.sender_family
    left join public.community_profiles fp on p.target_kind = 'family' and fp.family_id = public.as_uuid(p.target_id)
   where p.status = 'open'
   group by p.target_kind, p.target_id, p.listing_id, l.title, l.description, l.seller_name, l.status, rv.title, rv.body, rv.author_name, rv.hidden,
            ms.body, ms.hidden, sp.display_name, fp.display_name, fp.bio, fp.moderator_hidden
   order by bool_or(p.reason = 'copyright') desc, max(p.created_at) desc;
end;
$$;

-- hide: take it down; restore: put it back; dismiss: reports were wrong (and undo an automatic hide).
-- The owner is told when something of theirs is hidden or comes back.
create or replace function public.moderate(kind text, target text, action text, note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
  label text;
  was_hidden boolean;
  now_hidden boolean;
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  if action not in ('hide', 'restore', 'dismiss') or kind not in ('listing', 'review', 'message', 'family') then
    raise exception 'Unknown moderation action' using errcode = '22023';
  end if;
  perform set_config('freerange.moderating', 'on', true);
  if kind = 'listing' then
    select l.seller_family, l.title, l.status = 'suspended' into owner, label, was_hidden from public.listings l where l.id = target;
    update public.listings
       set status = case when action = 'hide' then 'suspended' when status = 'suspended' then 'active' else status end
     where id = target
    returning status = 'suspended' into now_hidden;
  elsif kind = 'review' then
    select rv.family_id, coalesce(l.title, ''), rv.hidden into owner, label, was_hidden
      from public.reviews rv left join public.listings l on l.id = rv.listing_id where rv.id = target;
    update public.reviews set hidden = (action = 'hide') where id = target returning hidden into now_hidden;
  elsif kind = 'family' then
    select p.family_id, p.display_name, p.moderator_hidden into owner, label, was_hidden from public.community_profiles p where p.family_id = public.as_uuid(target);
    update public.community_profiles set moderator_hidden = (action = 'hide') where family_id = public.as_uuid(target) returning moderator_hidden into now_hidden;
  else
    select ms.sender_family, left(ms.body, 80), ms.hidden into owner, label, was_hidden from public.messages ms where ms.id = public.as_uuid(target);
    update public.messages set hidden = (action = 'hide') where id = public.as_uuid(target) returning hidden into now_hidden;
  end if;
  perform set_config('freerange.moderating', 'off', true);
  if owner is not null and now_hidden is not null and now_hidden is distinct from was_hidden then
    insert into public.moderation_events (family_id, target_kind, target_id, action, title)
    values (owner, kind, target, case when now_hidden then 'hidden' else 'restored' end, left(coalesce(label, ''), 200));
  end if;
  update public.reports
     set status = case when action = 'hide' then 'actioned' else 'dismissed' end,
         resolution = left(coalesce(note, action), 500), resolved_by = auth.uid(), resolved_at = now()
   where target_kind = kind and target_id = target and status = 'open';
end;
$$;

-- Families can now block someone they've never messaged (from the finder or a
-- request), so the app lists who you blocked, to unblock them later.
create or replace function public.my_blocks()
returns table (family_id uuid, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.blocked_family, coalesce(p.display_name, 'A Freerange family'), b.created_at
    from public.family_blocks b
    left join public.community_profiles p on p.family_id = b.blocked_family
   where b.blocker_family = public.my_family_id()
   order by b.created_at desc;
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- ───────────────────────────── 2. The finder: member since, and no hidden families

drop function public.nearby_families(integer, integer, integer, text);
create function public.nearby_families(max_miles integer default 25, age_min integer default null, age_max integer default null, style text default null)
returns table (family_id uuid, display_name text, bio text, kid_ages smallint[], philosophies text[], interests text[], band text, miles_rounded integer, email_verified boolean, connection text, verified boolean, member_since timestamptz)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select public.my_family_id() as fid
  ), here as (
    select l.zip5 from public.family_locations l, me where l.family_id = me.fid
  )
  select p.family_id, p.display_name, p.bio, p.kid_ages, p.philosophies, p.interests,
         public.distance_band(d.miles), null::integer,
         public.email_verified_family(p.family_id),
         public.connection_status(me.fid, p.family_id),
         public.is_verified_family(p.family_id),
         -- Month precision is all the app shows.
         date_trunc('month', f.created_at)
    from public.community_profiles p
    join public.family_locations l on l.family_id = p.family_id
    join public.families f on f.id = p.family_id
    cross join me
    cross join lateral (select public.zip_miles((select zip5 from here), l.zip5) as miles) d
   where me.fid is not null
     and p.family_id <> me.fid
     and p.visible
     and not p.moderator_hidden
     -- Blocked families don't see each other.
     and not public.blocked_between(me.fid, p.family_id)
     and d.miles is not null and d.miles <= max_miles
     and (age_min is null or exists (select 1 from unnest(p.kid_ages) a where a between age_min and coalesce(age_max, 99)))
     and (style is null or style = any (p.philosophies))
   order by d.miles, p.display_name
   limit 100;
$$;
revoke all on function public.nearby_families(integer, integer, integer, text) from public, anon;
grant execute on function public.nearby_families(integer, integer, integer, text) to authenticated;

-- ───────────────────────────── 3. Field trips: a start time and details

alter table public.events add column start_time time;
alter table public.events add column details text not null default '' check (char_length(details) <= 1000);

drop function public.nearby_events(integer);
create function public.nearby_events(max_miles integer default 25)
returns table (id text, title text, starts_on date, location text, ages text, cost_per_kid numeric, capacity integer, host_name text, band text, going integer, carpooling integer, i_am_going boolean, i_carpool boolean, i_host boolean, carpool_names text[], start_time time, details text)
language sql stable security definer set search_path = ''
as $$
  with me as (select public.my_family_id() as fid),
       here as (select l.zip5 from public.family_locations l, me where l.family_id = me.fid)
  select e.id, e.title, e.starts_on, e.location, e.ages, e.cost_per_kid, e.capacity, e.host_name,
         public.distance_band(public.zip_miles((select zip5 from here), e.zip5)),
         (select count(*)::integer from public.event_rsvps r where r.event_id = e.id),
         (select count(*)::integer from public.event_rsvps r where r.event_id = e.id and r.carpool),
         exists (select 1 from public.event_rsvps r, me where r.event_id = e.id and r.family_id = me.fid),
         coalesce((select r.carpool from public.event_rsvps r, me where r.event_id = e.id and r.family_id = me.fid), false),
         e.host_family = (select fid from me),
         -- Carpool names are only visible to families who opted into the carpool themselves.
         case when coalesce((select r.carpool from public.event_rsvps r, me where r.event_id = e.id and r.family_id = me.fid), false)
              then (select array_agg(r.display_name order by r.created_at) from public.event_rsvps r, me where r.event_id = e.id and r.carpool and r.family_id <> me.fid) end,
         e.start_time,
         e.details
    from public.events e
   where e.starts_on >= current_date
     and (e.host_family = (select fid from me)
          or exists (select 1 from public.event_rsvps r, me where r.event_id = e.id and r.family_id = me.fid)
          or coalesce(public.zip_miles((select zip5 from here), e.zip5), 9999) <= max_miles)
   order by e.starts_on, e.start_time nulls first, e.title
   limit 200;
$$;
revoke all on function public.nearby_events(integer) from public, anon;
grant execute on function public.nearby_events(integer) to authenticated;
