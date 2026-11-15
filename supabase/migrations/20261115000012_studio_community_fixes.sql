-- Studio & Community fixes found by the test suite (supabase/tests/studioCommunity.test.ts).
--
-- 1. A package's origin_kind column is what publish_package() and co-op
--    classes check, but the app reads the origin from the content. A draft
--    saved with a mismatched column (a book conversion labelled "original")
--    could be published. The column now always follows the content.
-- 2. The recipient of a connection request could update its from_family and
--    "accept" a connection with any other family, seeing their contact
--    details and messaging them. Only the answer (status, responded_at) can
--    change now.
-- 3. A family could move its RSVP to a full (or past) trip, skipping the
--    capacity check, or rename itself on the RSVP list. Only the carpool
--    choice can change now.
-- 4. Co-op join requests and field trips took the family's name from the
--    client, so a family could ask to join (or host) under another family's
--    name; an organizer could also move a membership to a different family.
--    Names now come from the family's community profile, as RSVPs already do,
--    and a membership stays with its family.

-- ───────────────────────────── 1. Packages: origin_kind follows the content

create or replace function public.packages_origin_kind()
returns trigger
language plpgsql
as $$
begin
  -- An unknown kind in the content fails the column's check constraint.
  new.origin_kind := coalesce(nullif(new.content #>> '{origin,kind}', ''), new.origin_kind);
  return new;
end;
$$;
create or replace trigger packages_origin_kind before insert or update on public.packages
  for each row execute function public.packages_origin_kind();

-- Existing rows.
update public.packages set origin_kind = content #>> '{origin,kind}'
 where content #>> '{origin,kind}' in ('original', 'owned_book', 'open_web') and origin_kind <> content #>> '{origin,kind}';

-- ───────────────────────────── 2. Connections: only the answer changes

create or replace function public.connections_keep_parties()
returns trigger
language plpgsql
as $$
begin
  new.from_family := old.from_family;
  new.to_family := old.to_family;
  new.message := old.message;
  new.created_at := old.created_at;
  return new;
end;
$$;
-- Named to run before connections_block_guard (triggers fire in name order),
-- so the block check sees the real pair of families.
create or replace trigger connections_a_keep_parties before update on public.connections
  for each row execute function public.connections_keep_parties();

-- ───────────────────────────── 3. RSVPs: only the carpool choice changes

create or replace function public.event_rsvps_keep()
returns trigger
language plpgsql
as $$
begin
  new.event_id := old.event_id;
  new.family_id := old.family_id;
  new.display_name := old.display_name;
  new.created_at := old.created_at;
  return new;
end;
$$;
create or replace trigger event_rsvps_keep before update on public.event_rsvps
  for each row execute function public.event_rsvps_keep();

-- ───────────────────────────── 4. Names come from the family's profile

create or replace function public.coop_members_protect()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- The organizer's own row is added by coops_add_organizer() (already named this way).
    if auth.uid() is not null and pg_trigger_depth() = 1 then
      new.display_name := public.my_display_name();
      new.joined_at := now();
    end if;
  else
    new.coop_id := old.coop_id;
    new.family_id := old.family_id;
    new.display_name := old.display_name;
    new.joined_at := old.joined_at;
  end if;
  return new;
end;
$$;
create or replace trigger coop_members_protect before insert or update on public.coop_members
  for each row execute function public.coop_members_protect();

create or replace function public.events_protect()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.host_name := public.my_display_name();
      new.created_at := now();
    else
      new.host_name := old.host_name;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger events_protect before insert or update on public.events
  for each row execute function public.events_protect();
