-- Freerange: limits on Studio's web page fetches, and reviews that show how
-- far the reviewer's family got ("Finished 120/120 lessons").
--
-- fetch-page (an Edge Function running with the service role) asks
-- claim_page_fetch() before every page it loads for someone; the counts live
-- here so every function instance shares them.
--
-- A review's progress is computed on the server from the family's own synced
-- plan (the curriculum that came from that listing), when the review is
-- written or edited and whenever the family's plan syncs. Families can hide it.

-- ───────────────────────────── Web page fetch limits

create table public.page_fetches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index page_fetches_user_idx on public.page_fetches (user_id, at desc);
alter table public.page_fetches enable row level security;
-- No policies: only claim_page_fetch() reads and writes it.

-- Pages one person may load: a burst for importing a course (a book page and
-- its outline, a few retries), and a daily cap well above any real use.
create or replace function public.page_fetch_limits()
returns table (per_minute integer, per_day integer)
language sql immutable
as $$ select 20, 300 $$;

-- Records one fetch for this user if they're within their limits. Returns
-- {ok: true, remaining_today} or {ok: false, reason: 'minute'|'day', retry_after: seconds}.
create or replace function public.claim_page_fetch(uid uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  lim record;
  minute_count integer;
  day_count integer;
  oldest timestamptz;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  -- One claim at a time per person, so parallel requests can't slip past the count.
  perform pg_advisory_xact_lock(hashtextextended('page_fetch:' || uid::text, 0));
  select * into lim from public.page_fetch_limits();
  delete from public.page_fetches where user_id = uid and at < now() - interval '1 day';
  select count(*) filter (where at > now() - interval '1 minute'), count(*)
    into minute_count, day_count
    from public.page_fetches where user_id = uid;
  if minute_count >= lim.per_minute then
    select min(at) into oldest from public.page_fetches where user_id = uid and at > now() - interval '1 minute';
    return jsonb_build_object('ok', false, 'reason', 'minute', 'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 minute' - now()))))::integer);
  end if;
  if day_count >= lim.per_day then
    select min(at) into oldest from public.page_fetches where user_id = uid;
    return jsonb_build_object('ok', false, 'reason', 'day', 'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 day' - now()))))::integer);
  end if;
  insert into public.page_fetches (user_id) values (uid);
  return jsonb_build_object('ok', true, 'remaining_today', lim.per_day - day_count - 1);
end;
$$;
revoke all on function public.claim_page_fetch(uuid) from public, anon, authenticated;
grant execute on function public.claim_page_fetch(uuid) to service_role;

-- ───────────────────────────── Reviews that show progress

alter table public.reviews
  add column show_progress boolean not null default true,
  add column progress_done integer check (progress_done is null or progress_done >= 0),
  add column progress_total integer check (progress_total is null or progress_total >= 1);

-- A JSON number, or null for anything else (synced data is the client's, so never trust its shape).
create or replace function public.jsonb_number(v jsonb)
returns numeric
language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end $$;

-- How far a family's plan is through the curriculum it got from a listing
-- (mirrors reviewProgress() in the app): the furthest kid's lessons done,
-- out of the curriculum's lessons. No row when the plan doesn't have it.
create or replace function public.listing_progress(ws jsonb, lid text)
returns table (done integer, total integer)
language sql immutable set search_path = ''
as $$
  select least(x.d, x.t), x.t
    from (
      select floor(public.jsonb_number(c -> 'totalLessons'))::integer as t,
             least(100000, greatest(0, floor(coalesce(
               (select max(coalesce(public.jsonb_number(c -> 'progress' -> k), public.jsonb_number(c -> 'lessonsDone')))
                  from jsonb_array_elements_text(case when jsonb_typeof(c -> 'childIds') = 'array' then c -> 'childIds' else '[]'::jsonb end) k),
               public.jsonb_number(c -> 'lessonsDone'),
               0
             ))))::integer as d
        from jsonb_array_elements(case when jsonb_typeof(ws -> 'curricula') = 'array' then ws -> 'curricula' else '[]'::jsonb end) c
       where jsonb_typeof(c) = 'object'
         and c ->> 'listingId' = lid
         and public.jsonb_number(c -> 'totalLessons') between 1 and 100000
    ) x
   order by least(x.d, x.t)::numeric / x.t desc, x.t desc
   limit 1;
$$;

-- Whatever the client sends, progress comes from the family's own plan (or is hidden).
create or replace function public.reviews_progress()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.progress_done := null;
  new.progress_total := null;
  if new.show_progress and new.family_id is not null then
    select p.done, p.total into new.progress_done, new.progress_total
      from public.workspaces w, public.listing_progress(w.data, new.listing_id) p
     where w.family_id = new.family_id;
  end if;
  return new;
end;
$$;
create trigger reviews_progress before insert or update on public.reviews
  for each row execute function public.reviews_progress();

-- When a family's plan syncs, their reviews follow along (only rows whose numbers changed).
create or replace function public.workspaces_review_progress()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.reviews r
     set progress_done = p.done, progress_total = p.total
    from (
      select rv.id, lp.done, lp.total
        from public.reviews rv
        left join lateral public.listing_progress(new.data, rv.listing_id) lp on true
       where rv.family_id = new.family_id and rv.show_progress
    ) p
   where r.id = p.id
     and (r.progress_done is distinct from p.done or r.progress_total is distinct from p.total);
  return null;
exception when others then
  -- Never let review numbers get in the way of a family's sync; they catch up on the next one.
  raise warning 'review progress not refreshed for family %: %', new.family_id, sqlerrm;
  return null;
end;
$$;
create trigger workspaces_review_progress after update of data on public.workspaces
  for each row when (old.data is distinct from new.data)
  execute function public.workspaces_review_progress();

-- Reviews of existing families pick up their progress now.
update public.reviews set show_progress = show_progress where family_id is not null;
