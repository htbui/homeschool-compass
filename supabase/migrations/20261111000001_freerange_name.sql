-- Rename: the app is now called Freerange. Updates the user-facing text that
-- the database itself writes (default family name, Studio listing blurb).

create or replace function public.my_display_name()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select display_name from public.community_profiles where family_id = public.my_family_id()), 'A Freerange family');
$$;

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
    array[lessons || ' lessons', 'Lesson-by-lesson plan that schedules into Freerange'],
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

update public.listings
   set includes = array_replace(includes, 'Lesson-by-lesson plan that schedules into Kinship', 'Lesson-by-lesson plan that schedules into Freerange')
 where 'Lesson-by-lesson plan that schedules into Kinship' = any (includes);
