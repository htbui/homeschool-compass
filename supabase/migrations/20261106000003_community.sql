-- Freerange Community: family finder, connection requests, co-ops, field trips.
--
-- Parents only (kids never reach these screens). Locations are ZIP codes kept
-- in a private table; other families only ever see a distance band such as
-- "within 5 mi", computed server-side. Contact details are shared only after
-- both families accept a connection.

-- ZIP code (ZCTA) centroids for distance bands. Load with `npm run db:zcta`
-- (U.S. Census Gazetteer, public domain). Without it, distance falls back to
-- ZIP-prefix matching.
create table public.zcta (
  zip5 text primary key check (zip5 ~ '^\d{5}$'),
  lat double precision not null,
  lng double precision not null
);
alter table public.zcta enable row level security;
-- No policies: only security-definer functions read it.

create or replace function public.zip_miles(a text, b text)
returns double precision
language sql stable security definer set search_path = ''
as $$
  select case
    when a is null or b is null then null
    when a = b then 0
    else coalesce(
      (select 3958.8 * 2 * asin(sqrt(
                power(sin(radians(zb.lat - za.lat) / 2), 2) +
                cos(radians(za.lat)) * cos(radians(zb.lat)) * power(sin(radians(zb.lng - za.lng) / 2), 2)))
         from public.zcta za, public.zcta zb
        where za.zip5 = a and zb.zip5 = b),
      -- No centroid data: same 3-digit ZIP prefix ≈ same metro area.
      case when left(a, 3) = left(b, 3) then 20 end)
  end;
$$;

create or replace function public.distance_band(miles double precision)
returns text
language sql immutable
as $$
  select case
    when miles is null then 'distance unknown'
    when miles <= 2 then 'within 2 mi'
    when miles <= 5 then 'within 5 mi'
    when miles <= 10 then 'within 10 mi'
    when miles <= 25 then 'within 25 mi'
    when miles <= 50 then 'within 50 mi'
    else 'over 50 mi'
  end;
$$;

-- ───────────────────────────── Profiles & locations

create table public.family_locations (
  family_id uuid primary key references public.families (id) on delete cascade,
  zip5 text not null check (zip5 ~ '^\d{5}$'),
  updated_at timestamptz not null default now()
);
alter table public.family_locations enable row level security;
create policy "family manages its location" on public.family_locations
  for all to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
grant select, insert, update, delete on public.family_locations to authenticated;

create table public.community_profiles (
  family_id uuid primary key references public.families (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  kid_ages smallint[] not null default '{}',
  philosophies text[] not null default '{}',
  interests text[] not null default '{}',
  -- Shared only with accepted connections (via my_connections()).
  contact text not null default '' check (char_length(contact) <= 200),
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.community_profiles enable row level security;
create policy "family manages its profile" on public.community_profiles
  for all to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
grant select, insert, update, delete on public.community_profiles to authenticated;

create or replace function public.my_display_name()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select display_name from public.community_profiles where family_id = public.my_family_id()), 'A Freerange family');
$$;

create or replace function public.email_verified_family(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m join auth.users u on u.id = m.user_id
     where m.family_id = fid and u.email_confirmed_at is not null
  );
$$;

-- ───────────────────────────── Connections

create table public.connections (
  from_family uuid not null references public.families (id) on delete cascade,
  to_family uuid not null references public.families (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  message text not null default '' check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (from_family, to_family),
  check (from_family <> to_family)
);
alter table public.connections enable row level security;
create policy "families see their connections" on public.connections
  for select to authenticated using (public.is_family_member(from_family) or public.is_family_member(to_family));
create policy "families send requests" on public.connections
  for insert to authenticated with check (public.is_family_member(from_family) and status = 'pending');
create policy "recipients answer requests" on public.connections
  for update to authenticated using (public.is_family_member(to_family)) with check (public.is_family_member(to_family) and status in ('accepted', 'declined'));
create policy "either side removes a connection" on public.connections
  for delete to authenticated using (public.is_family_member(from_family) or public.is_family_member(to_family));
grant select, insert, update, delete on public.connections to authenticated;

create or replace function public.connection_status(me uuid, other uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case
       when c.status = 'accepted' then 'connected'
       when c.status = 'declined' then 'declined'
       when c.from_family = me then 'requested'
       else 'incoming' end
       from public.connections c
      where (c.from_family = me and c.to_family = other) or (c.from_family = other and c.to_family = me)
      order by (c.status = 'accepted') desc
      limit 1),
    'none');
$$;

create or replace function public.nearby_families(max_miles integer default 25, age_min integer default null, age_max integer default null, style text default null)
returns table (family_id uuid, display_name text, bio text, kid_ages smallint[], philosophies text[], interests text[], band text, miles_rounded integer, email_verified boolean, connection text)
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
         public.connection_status(me.fid, p.family_id)
    from public.community_profiles p
    join public.family_locations l on l.family_id = p.family_id
    cross join me
    cross join lateral (select public.zip_miles((select zip5 from here), l.zip5) as miles) d
   where me.fid is not null
     and p.family_id <> me.fid
     and p.visible
     and d.miles is not null and d.miles <= max_miles
     and (age_min is null or exists (select 1 from unnest(p.kid_ages) a where a between age_min and coalesce(age_max, 99)))
     and (style is null or style = any (p.philosophies))
   order by d.miles, p.display_name
   limit 100;
$$;

-- Connected (and pending) families, with contact details once accepted.
create or replace function public.my_connections()
returns table (family_id uuid, display_name text, status text, direction text, message text, contact text, kid_ages smallint[], band text)
language sql stable security definer set search_path = ''
as $$
  with me as (select public.my_family_id() as fid)
  select other.family_id, coalesce(p.display_name, 'A Freerange family'), c.status,
         case when c.from_family = me.fid then 'outgoing' else 'incoming' end,
         c.message,
         case when c.status = 'accepted' then coalesce(p.contact, '') else '' end,
         coalesce(p.kid_ages, '{}'),
         public.distance_band(public.zip_miles(
           (select zip5 from public.family_locations where family_id = me.fid),
           (select zip5 from public.family_locations where family_id = other.family_id)))
    from public.connections c
    cross join me
    cross join lateral (select case when c.from_family = me.fid then c.to_family else c.from_family end as family_id) other
    left join public.community_profiles p on p.family_id = other.family_id
   where me.fid in (c.from_family, c.to_family) and c.status <> 'declined'
   order by c.created_at desc;
$$;

-- ───────────────────────────── Co-ops

create table public.coops (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  meets text not null default 'TBD' check (char_length(meets) <= 120),
  zip5 text check (zip5 ~ '^\d{5}$'),
  organizer_family uuid not null references public.families (id) on delete cascade,
  duties jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table public.coop_members (
  coop_id text not null references public.coops (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('organizer', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  joined_at timestamptz not null default now(),
  primary key (coop_id, family_id)
);

create or replace function public.coop_role(cid text)
returns text
language sql stable security definer set search_path = ''
as $$
  select case when m.status = 'active' then m.role else 'pending' end
    from public.coop_members m where m.coop_id = cid and m.family_id = public.my_family_id();
$$;

alter table public.coops enable row level security;
alter table public.coop_members enable row level security;
create policy "parents browse co-ops" on public.coops for select to authenticated using (true);
create policy "families start co-ops" on public.coops for insert to authenticated with check (public.is_family_member(organizer_family));
create policy "organizers edit co-ops" on public.coops for update to authenticated using (public.coop_role(id) = 'organizer') with check (public.coop_role(id) = 'organizer');
create policy "organizers delete co-ops" on public.coops for delete to authenticated using (public.coop_role(id) = 'organizer');
grant select, insert, update, delete on public.coops to authenticated;

create policy "members see the roster" on public.coop_members for select to authenticated
  using (public.is_family_member(family_id) or public.coop_role(coop_id) in ('organizer', 'member'));
create policy "families ask to join" on public.coop_members for insert to authenticated
  with check (public.is_family_member(family_id) and role = 'member' and status = 'pending');
create policy "organizers approve" on public.coop_members for update to authenticated
  using (public.coop_role(coop_id) = 'organizer') with check (public.coop_role(coop_id) = 'organizer');
create policy "leave or remove" on public.coop_members for delete to authenticated
  using (public.is_family_member(family_id) or public.coop_role(coop_id) = 'organizer');
grant select, insert, update, delete on public.coop_members to authenticated;

create or replace function public.coops_add_organizer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.coop_members (coop_id, family_id, display_name, role, status)
  values (new.id, new.organizer_family, public.my_display_name(), 'organizer', 'active');
  return new;
end;
$$;
create trigger coops_add_organizer after insert on public.coops
  for each row execute function public.coops_add_organizer();

create or replace function public.nearby_coops(max_miles integer default 25)
returns table (id text, name text, description text, meets text, band text, organizer text, member_count integer, my_role text, members text[], pending text[], duties jsonb)
language sql stable security definer set search_path = ''
as $$
  with me as (select public.my_family_id() as fid),
       here as (select l.zip5 from public.family_locations l, me where l.family_id = me.fid)
  select c.id, c.name, c.description, c.meets,
         public.distance_band(public.zip_miles((select zip5 from here), c.zip5)),
         (select m.display_name from public.coop_members m where m.coop_id = c.id and m.role = 'organizer' limit 1),
         (select count(*)::integer from public.coop_members m where m.coop_id = c.id and m.status = 'active'),
         public.coop_role(c.id),
         case when public.coop_role(c.id) in ('organizer', 'member')
              then (select array_agg(m.display_name order by m.joined_at) from public.coop_members m where m.coop_id = c.id and m.status = 'active') end,
         case when public.coop_role(c.id) = 'organizer'
              then (select array_agg(m.family_id::text || '|' || m.display_name order by m.joined_at) from public.coop_members m where m.coop_id = c.id and m.status = 'pending') end,
         case when public.coop_role(c.id) in ('organizer', 'member') then c.duties else '[]'::jsonb end
    from public.coops c
   where public.coop_role(c.id) is not null
      or coalesce(public.zip_miles((select zip5 from here), c.zip5), 9999) <= max_miles
   order by public.coop_role(c.id) is null, c.created_at desc
   limit 100;
$$;

-- ───────────────────────────── Field trips & meetups

create table public.events (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(title) between 1 and 160),
  starts_on date not null,
  location text not null default 'TBD' check (char_length(location) <= 200),
  zip5 text check (zip5 ~ '^\d{5}$'),
  ages text not null default 'All ages',
  cost_per_kid numeric(8, 2) not null default 0 check (cost_per_kid >= 0),
  capacity integer not null default 20 check (capacity between 1 and 1000),
  host_family uuid not null references public.families (id) on delete cascade,
  host_name text not null,
  created_at timestamptz not null default now()
);
create table public.event_rsvps (
  event_id text not null references public.events (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  display_name text not null,
  carpool boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, family_id)
);

alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
create policy "parents browse events" on public.events for select to authenticated using (true);
create policy "families host events" on public.events for insert to authenticated with check (public.is_family_member(host_family));
create policy "hosts edit events" on public.events for update to authenticated using (public.is_family_member(host_family)) with check (public.is_family_member(host_family));
create policy "hosts cancel events" on public.events for delete to authenticated using (public.is_family_member(host_family));
grant select, insert, update, delete on public.events to authenticated;

create policy "see own and hosted RSVPs" on public.event_rsvps for select to authenticated
  using (public.is_family_member(family_id) or exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.host_family)));
create policy "families RSVP" on public.event_rsvps for insert to authenticated with check (public.is_family_member(family_id));
create policy "families update their RSVP" on public.event_rsvps for update to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "families cancel their RSVP" on public.event_rsvps for delete to authenticated using (public.is_family_member(family_id));
grant select, insert, update, delete on public.event_rsvps to authenticated;

create or replace function public.event_rsvps_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events where id = new.event_id for update;
  if e.starts_on < current_date then
    raise exception 'That event already happened' using errcode = '22023';
  end if;
  if (select count(*) from public.event_rsvps r where r.event_id = new.event_id) >= e.capacity then
    raise exception 'That event is full' using errcode = '23514';
  end if;
  new.display_name := public.my_display_name();
  return new;
end;
$$;
create trigger event_rsvps_check before insert on public.event_rsvps
  for each row execute function public.event_rsvps_check();

-- Hosts are going to their own events.
create or replace function public.events_host_rsvp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.event_rsvps (event_id, family_id, display_name) values (new.id, new.host_family, new.host_name);
  return new;
end;
$$;
create trigger events_host_rsvp after insert on public.events
  for each row execute function public.events_host_rsvp();

create or replace function public.nearby_events(max_miles integer default 25)
returns table (id text, title text, starts_on date, location text, ages text, cost_per_kid numeric, capacity integer, host_name text, band text, going integer, carpooling integer, i_am_going boolean, i_carpool boolean, i_host boolean, carpool_names text[])
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
              then (select array_agg(r.display_name order by r.created_at) from public.event_rsvps r, me where r.event_id = e.id and r.carpool and r.family_id <> me.fid) end
    from public.events e
   where e.starts_on >= current_date
     and (e.host_family = (select fid from me)
          or exists (select 1 from public.event_rsvps r, me where r.event_id = e.id and r.family_id = me.fid)
          or coalesce(public.zip_miles((select zip5 from here), e.zip5), 9999) <= max_miles)
   order by e.starts_on, e.title
   limit 200;
$$;

revoke all on function public.nearby_families(integer, integer, integer, text), public.my_connections(), public.nearby_coops(integer), public.nearby_events(integer) from public, anon;
grant execute on function public.nearby_families(integer, integer, integer, text), public.my_connections(), public.nearby_coops(integer), public.nearby_events(integer) to authenticated;
