-- Studio Insights: anonymous, aggregated lesson signals for creators.
--
-- A family's devices report one row per lesson of a Studio plan they use:
-- finished or skipped, minutes taken vs. planned, and whether a kid marked
-- it tricky. No child names, ids, or counts are sent. Rows are keyed by
-- family so re-sending replaces instead of adding up, and nobody can read
-- them directly: creators get totals through lesson_insights(), and only for
-- lessons at least 5 families have reported (timings need 5 timed families).
--
-- Sharing is on unless the family turns it off in Settings, which sets
-- family.insightsOptOut in its workspace. The server honors that: reports
-- are refused, and everything the family shared is deleted.

create table public.lesson_reports (
  listing_id text not null references public.listings (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 100),
  lesson_no integer not null check (lesson_no between 1 and 10000),
  done boolean not null default false,
  skipped boolean not null default false,
  minutes smallint check (minutes is null or minutes between 1 and 600),
  planned smallint check (planned is null or planned between 1 and 600),
  tricky boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (listing_id, family_id, lesson_id)
);
create index lesson_reports_family_idx on public.lesson_reports (family_id);

alter table public.lesson_reports enable row level security;
-- No policies: written by report_lesson_progress(), read only as totals.
revoke all on public.lesson_reports from anon, authenticated;

create or replace function public.insights_opted_out(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select w.data #>> '{family,insightsOptOut}' = 'true' from public.workspaces w where w.family_id = fid), false);
$$;
revoke all on function public.insights_opted_out(uuid) from public, anon, authenticated;

-- Upsert this family's lesson rows. Only Studio plans the family owns (or
-- free ones) count, never the creator's own family, and nothing at all once
-- the family has opted out. Returns how many rows were accepted.
create or replace function public.report_lesson_progress(reports jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  r jsonb;
  l public.listings;
  n integer := 0;
  num text;
begin
  if fid is null then
    raise exception 'Join a family first' using errcode = '42501';
  end if;
  if jsonb_typeof(reports) is distinct from 'array' then
    raise exception 'Send a list of lesson reports' using errcode = '22023';
  end if;
  if jsonb_array_length(reports) > 500 then
    raise exception 'Send up to 500 lesson reports at a time' using errcode = '22023';
  end if;
  if public.insights_opted_out(fid) then
    delete from public.lesson_reports where family_id = fid;
    return 0;
  end if;
  for r in select * from jsonb_array_elements(reports) loop
    continue when jsonb_typeof(r) is distinct from 'object';
    select * into l from public.listings where id = r ->> 'listingId';
    continue when not found or l.package_id is null;
    continue when l.creator_user is not null and exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = l.creator_user);
    continue when not (public.owns_listing(fid, l.id) or l.price = 0);
    continue when coalesce(char_length(r ->> 'lessonId'), 0) not between 1 and 100;
    num := r ->> 'lessonNo';
    -- (CASE, not OR: SQL doesn't promise to check the pattern before casting.)
    continue when case when num ~ '^\d{1,5}$' then num::integer not between 1 and 10000 else true end;
    insert into public.lesson_reports as lr (listing_id, family_id, lesson_id, lesson_no, done, skipped, minutes, planned, tricky)
    values (
      l.id, fid, r ->> 'lessonId', num::integer,
      coalesce(r ->> 'done', '') = 'true',
      coalesce(r ->> 'skipped', '') = 'true' and coalesce(r ->> 'done', '') <> 'true',
      case when r ->> 'minutes' ~ '^\d{1,3}$' then case when (r ->> 'minutes')::integer between 1 and 600 then (r ->> 'minutes')::smallint end end,
      case when r ->> 'planned' ~ '^\d{1,3}$' then case when (r ->> 'planned')::integer between 1 and 600 then (r ->> 'planned')::smallint end end,
      coalesce(r ->> 'tricky', '') = 'true'
    )
    on conflict (listing_id, family_id, lesson_id) do update
      set lesson_no = excluded.lesson_no, done = excluded.done, skipped = excluded.skipped, minutes = excluded.minutes,
          planned = excluded.planned, tricky = excluded.tricky, updated_at = now()
      -- Only real changes count as activity (for "families who stopped here").
      where (lr.lesson_no, lr.done, lr.skipped, lr.minutes, lr.planned, lr.tricky)
            is distinct from (excluded.lesson_no, excluded.done, excluded.skipped, excluded.minutes, excluded.planned, excluded.tricky);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.report_lesson_progress(jsonb) from public, anon;
grant execute on function public.report_lesson_progress(jsonb) to authenticated;

-- Delete everything this family has shared (turning sharing off does this too).
create or replace function public.forget_lesson_reports()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.lesson_reports where family_id = public.my_family_id();
$$;
revoke all on function public.forget_lesson_reports() from public, anon;
grant execute on function public.forget_lesson_reports() to authenticated;

-- Opting out in Settings (synced into the workspace) removes what was shared,
-- even if this device never calls forget_lesson_reports().
create or replace function public.workspaces_insights_opt_out()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.data #>> '{family,insightsOptOut}' = 'true' then
    delete from public.lesson_reports where family_id = new.family_id;
  end if;
  return null;
end;
$$;
create trigger workspaces_insights_opt_out after insert or update of data on public.workspaces
  for each row execute function public.workspaces_insights_opt_out();

-- Per-lesson totals for the listing's creator. Lessons fewer than 5 families
-- reported are left out entirely; average minutes need 5 timed families.
create or replace function public.lesson_insights(lid text)
returns table (lesson_id text, families integer, done integer, skipped integer, tricky integer, avg_minutes numeric, avg_planned numeric, stopped_here integer, total_families integer)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select r.* from public.lesson_reports r
     where r.listing_id = lid
       and exists (select 1 from public.listings l where l.id = lid and l.creator_user = auth.uid())
  ), fam as (
    select m.family_id, max(m.updated_at) as last_at, max(m.lesson_no) filter (where m.done) as furthest
      from mine m group by m.family_id
  ), stopped as (
    select m.lesson_id, count(*)::integer as n
      from mine m join fam f on f.family_id = m.family_id
     where m.done and m.lesson_no = f.furthest and f.last_at < now() - interval '30 days'
     group by m.lesson_id
  )
  select m.lesson_id,
         count(*)::integer,
         (count(*) filter (where m.done))::integer,
         (count(*) filter (where m.skipped and not m.done))::integer,
         (count(*) filter (where m.tricky))::integer,
         case when count(m.minutes) >= 5 then round(avg(m.minutes), 1) end,
         case when count(m.minutes) >= 5 then round(avg(m.planned) filter (where m.minutes is not null), 1) end,
         coalesce(max(s.n), 0)::integer,
         (select count(*)::integer from fam)
    from mine m
    left join stopped s on s.lesson_id = m.lesson_id
   group by m.lesson_id
  having count(*) >= 5;
$$;
revoke all on function public.lesson_insights(text) from public, anon;
grant execute on function public.lesson_insights(text) to authenticated;
