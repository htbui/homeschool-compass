-- Kinship Studio: creators make lesson-by-lesson curriculum packages and
-- publish them to the Marketplace.
--
-- Packages are private drafts owned by one user (no family needed). Publishing
-- goes through publish_package(), which enforces the license rules on the
-- server — conversions of owned books never publish, adaptations keep the
-- source's license, and non-commercial sources must be free — and stores an
-- immutable release. Buyers read a release's full lessons through
-- package_content() only once they own the listing (or it's free).

-- ───────────────────────────── Creator profiles

create table public.creator_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  bio text not null default '' check (char_length(bio) <= 1000),
  website text check (website is null or website ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_profiles enable row level security;
create policy "anyone reads creator profiles" on public.creator_profiles
  for select to anon, authenticated using (true);
create policy "creators write their profile" on public.creator_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "creators edit their profile" on public.creator_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.creator_profiles to anon, authenticated;
grant insert, update on public.creator_profiles to authenticated;

-- ───────────────────────────── Packages (drafts)

create table public.packages (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 160),
  origin_kind text not null check (origin_kind in ('original', 'owned_book', 'open_web')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index packages_owner_idx on public.packages (owner, updated_at desc);

alter table public.packages enable row level security;
create policy "creators see their packages" on public.packages
  for select to authenticated using (owner = auth.uid());
create policy "creators add packages" on public.packages
  for insert to authenticated with check (owner = auth.uid());
create policy "creators edit packages" on public.packages
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "creators delete packages" on public.packages
  for delete to authenticated using (owner = auth.uid());
grant select, insert, update, delete on public.packages to authenticated;

-- ───────────────────────────── Listings made from packages

alter table public.listings drop constraint listings_seller_kind_check;
alter table public.listings add constraint listings_seller_kind_check check (seller_kind in ('publisher', 'creator', 'family'));
alter table public.listings
  add column creator_user uuid references auth.users (id) on delete set null,
  add column package_id text,
  add column package_version integer,
  add column license jsonb,
  add column attribution text check (attribution is null or char_length(attribution) <= 1000),
  add column outline jsonb;
create index listings_creator_idx on public.listings (creator_user);
create unique index listings_package_idx on public.listings (package_id) where package_id is not null;

drop policy "anyone browses active listings" on public.listings;
create policy "anyone browses active listings" on public.listings
  for select to anon, authenticated using (status = 'active' or public.is_family_member(seller_family) or creator_user = auth.uid());

-- Families can't touch the package fields of their own listings; only
-- publish_package() (which sets kinship.publishing) writes them.
create or replace function public.listings_protect()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1 and coalesce(current_setting('kinship.publishing', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.seller_verified := false;
      new.esa_eligible := false;
      new.rating_avg := 0;
      new.rating_count := 0;
      new.sample := false;
      new.created_at := now();
      new.creator_user := null;
      new.package_id := null;
      new.package_version := null;
      new.license := null;
      new.attribution := null;
      new.outline := null;
    else
      new.seller_verified := old.seller_verified;
      new.esa_eligible := old.esa_eligible;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.sample := old.sample;
      new.seller_family := old.seller_family;
      new.created_at := old.created_at;
      new.creator_user := old.creator_user;
      new.package_id := old.package_id;
      new.package_version := old.package_version;
      new.license := old.license;
      new.attribution := old.attribution;
      new.outline := old.outline;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Creators can't review their own curricula either.
create or replace function public.reviews_protect()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1 then
    new.verified := public.owns_listing(new.family_id, new.listing_id);
    new.sample := false;
    if tg_op = 'INSERT' then
      new.helpful := 0;
      new.created_at := now();
    else
      new.helpful := old.helpful;
      new.created_at := old.created_at;
      new.listing_id := old.listing_id;
      new.family_id := old.family_id;
    end if;
    if exists (select 1 from public.listings l where l.id = new.listing_id and (public.is_family_member(l.seller_family) or l.creator_user = auth.uid())) then
      raise exception 'You can''t review your own listing' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────── Releases (what buyers get)

create table public.package_releases (
  listing_id text not null references public.listings (id) on delete cascade,
  version integer not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (listing_id, version)
);
alter table public.package_releases enable row level security;
-- No policies: read only through package_content().

create or replace function public.publish_package(pkg_id text)
returns public.listings
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pkg public.packages;
  c jsonb;
  prof public.creator_profiles;
  lic text;
  confirmed boolean;
  nc boolean;
  price numeric;
  lessons integer;
  outline jsonb;
  existing public.listings;
  lid text;
  ver integer;
  l public.listings;
begin
  if uid is null then
    raise exception 'Sign in to publish' using errcode = '42501';
  end if;
  select * into pkg from public.packages where id = pkg_id and owner = uid;
  if not found then
    raise exception 'Curriculum not found' using errcode = 'P0002';
  end if;
  select * into prof from public.creator_profiles where user_id = uid;
  if not found then
    raise exception 'Set up your creator profile first' using errcode = '22023';
  end if;
  c := pkg.content;
  lic := coalesce(c #>> '{license,kind}', 'unknown');
  confirmed := coalesce((c ->> 'licenseConfirmed')::boolean, false);
  nc := lic in ('cc_by_nc', 'cc_by_nc_sa', 'cc_by_nc_nd');
  price := coalesce((c ->> 'price')::numeric, 0);

  -- License rules (mirrors publishRules() in the app).
  if pkg.origin_kind = 'owned_book' then
    raise exception 'Conversions of a book you own stay private to your family' using errcode = '42501';
  elsif pkg.origin_kind = 'open_web' then
    if lic not in ('cc0', 'public_domain', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa') then
      raise exception 'The source''s license doesn''t allow publishing an adapted version' using errcode = '42501';
    end if;
    if not confirmed then
      raise exception 'Confirm the source''s license before publishing' using errcode = '22023';
    end if;
    if coalesce(c #>> '{origin,url}', '') = '' or position(c #>> '{origin,url}' in coalesce(c ->> 'attribution', '')) = 0 then
      raise exception 'Adaptations must credit their source' using errcode = '22023';
    end if;
  elsif lic not in ('all_rights_reserved', 'cc0', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa', 'cc_by_nd', 'cc_by_nc_nd') then
    raise exception 'Choose a license' using errcode = '22023';
  end if;
  if pkg.origin_kind = 'open_web' and nc then
    price := 0; -- non-commercial sources are always free
  end if;

  select jsonb_agg(u.outline_unit order by u.ord)
    into outline
    from (
      select uo.ord, jsonb_build_object('title', uo.unit ->> 'title', 'lessons', coalesce((select jsonb_agg(le ->> 'title' order by lo.ord) from jsonb_array_elements(uo.unit -> 'lessons') with ordinality lo(le, ord)), '[]'::jsonb)) as outline_unit
        from jsonb_array_elements(coalesce(c -> 'units', '[]'::jsonb)) with ordinality uo(unit, ord)
    ) u;
  select count(*) into lessons from jsonb_array_elements(coalesce(c -> 'units', '[]'::jsonb)) u, jsonb_array_elements(u -> 'lessons') le;
  if lessons < 1 then
    raise exception 'Add at least one lesson' using errcode = '22023';
  end if;

  select * into existing from public.listings where package_id = pkg.id;
  lid := coalesce(existing.id, c ->> 'listingId', gen_random_uuid()::text);
  perform set_config('kinship.publishing', 'on', true);
  insert into public.listings (
    id, seller_family, seller_name, seller_kind, creator_user, title, subjects, grade_min, grade_max, philosophies, format, price,
    description, includes, lessons, lessons_per_week, minutes_per_lesson, parent_involvement, family_style, lesson_steps, cover, color,
    package_id, package_version, license, attribution, outline, status
  ) values (
    lid, null, prof.name, 'creator', uid, c ->> 'title',
    coalesce((select array_agg(x) from jsonb_array_elements_text(c -> 'subjects') x), '{}'),
    (c ->> 'gradeMin')::smallint, (c ->> 'gradeMax')::smallint,
    coalesce((select array_agg(x) from jsonb_array_elements_text(c -> 'philosophies') x), '{}'),
    c ->> 'format', price, coalesce(c ->> 'description', ''),
    array[lessons || ' lessons', 'Lesson-by-lesson plan that schedules into Kinship'],
    lessons, coalesce((c ->> 'lessonsPerWeek')::smallint, 3), coalesce((c ->> 'minutesPerLesson')::smallint, 30),
    coalesce(c ->> 'parentInvolvement', 'medium'), coalesce((c ->> 'familyStyle')::boolean, false), '{}',
    coalesce(c ->> 'cover', '📘'), coalesce(c ->> 'color', '#2F6B5E'),
    pkg.id, null, c -> 'license', c ->> 'attribution', coalesce(outline, '[]'::jsonb), 'active'
  )
  on conflict (id) do update set
    seller_name = excluded.seller_name, title = excluded.title, subjects = excluded.subjects, grade_min = excluded.grade_min,
    grade_max = excluded.grade_max, philosophies = excluded.philosophies, format = excluded.format, price = excluded.price,
    description = excluded.description, includes = excluded.includes, lessons = excluded.lessons, lessons_per_week = excluded.lessons_per_week,
    minutes_per_lesson = excluded.minutes_per_lesson, parent_involvement = excluded.parent_involvement, family_style = excluded.family_style,
    cover = excluded.cover, color = excluded.color, license = excluded.license, attribution = excluded.attribution,
    outline = excluded.outline, status = 'active'
  where public.listings.creator_user = uid;
  if not found then
    raise exception 'That listing belongs to someone else' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into ver from public.package_releases where listing_id = lid;
  insert into public.package_releases (listing_id, version, content)
  values (lid, ver, jsonb_build_object('units', c -> 'units', 'license', c -> 'license', 'attribution', c -> 'attribution', 'version', ver));
  update public.listings set package_version = ver where id = lid returning * into l;
  update public.packages
     set content = c || jsonb_build_object('status', 'published', 'version', ver, 'listingId', lid, 'price', price, 'publishedAt', now()),
         updated_at = now()
   where id = pkg.id;
  return l;
end;
$$;
revoke all on function public.publish_package(text) from public, anon;
grant execute on function public.publish_package(text) to authenticated;

create or replace function public.unpublish_package(pkg_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('kinship.publishing', 'on', true);
  update public.listings set status = 'removed' where package_id = pkg_id and creator_user = auth.uid();
  update public.packages set content = content || '{"status":"draft"}'::jsonb, updated_at = now() where id = pkg_id and owner = auth.uid();
end;
$$;
revoke all on function public.unpublish_package(text) from public, anon;
grant execute on function public.unpublish_package(text) to authenticated;

-- The full lesson plan for a listing: free ones for anyone signed in, paid
-- ones once this family owns it, and always for the creator. Buyers keep
-- access after a listing is unpublished.
create or replace function public.package_content(lid text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.listings;
  r jsonb;
begin
  select * into l from public.listings where id = lid;
  if not found or l.package_id is null then
    return null;
  end if;
  if not (
    l.creator_user = auth.uid()
    or public.owns_listing(public.my_family_id(), lid)
    or (l.price = 0 and l.status = 'active')
  ) then
    raise exception 'Get this curriculum first' using errcode = '42501';
  end if;
  select content into r from public.package_releases where listing_id = lid order by version desc limit 1;
  return r;
end;
$$;
revoke all on function public.package_content(text) from public, anon;
grant execute on function public.package_content(text) to authenticated;

-- Sales and ratings for the creator's dashboard.
create or replace function public.creator_stats()
returns table (listing_id text, package_id text, title text, price numeric, status text, version integer, sales bigint, revenue numeric, rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.package_id, l.title, l.price, l.status, l.package_version,
         count(p.id) filter (where p.status in ('paid', 'free')),
         coalesce(sum(p.price) filter (where p.status = 'paid' and not p.demo), 0),
         l.rating_avg, l.rating_count
    from public.listings l
    left join public.purchases p on p.listing_id = l.id
   where l.creator_user = auth.uid()
   group by l.id;
$$;
revoke all on function public.creator_stats() from public, anon;
grant execute on function public.creator_stats() to authenticated;
