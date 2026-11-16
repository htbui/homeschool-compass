-- Marketplace design review (MKT-03, MKT-08): used curricula from families.
--
-- * Buyers can message the family selling a used curriculum without being
--   connected in Community first. message_seller() starts (or continues) the
--   two families' one conversation and remembers which listing it began with;
--   after that either family can reply with send_message(). Blocks, reports,
--   and sending limits work exactly as for connected families, and nothing
--   about either family (contact details, location) is shared: the seller is
--   shown by the name on the listing (first name and last initial).
-- * Family listings can carry 1–4 photos (a public bucket, one folder per
--   family), a pickup area (a city, never an address), whether they can ship,
--   and whether the seller knows the lesson numbers (optional for used books).

-- ───────────────────────────── Listing details

alter table public.listings
  add column photos text[] not null default '{}',
  add column pickup_area text check (pickup_area is null or char_length(btrim(pickup_area)) between 1 and 60),
  add column ships boolean not null default false,
  add column pace_known boolean not null default true;

-- Photos are object paths in the listing-photos bucket ("<family id>/<name>.jpg"), never outside links.
create or replace function public.listing_photos_ok(paths text[])
returns boolean
language sql immutable
as $$
  select coalesce(cardinality(paths), 0) <= 4
     and not exists (select 1 from unnest(paths) p where p !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$');
$$;
alter table public.listings add constraint listings_photos_check check (public.listing_photos_ok(photos));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Anyone can see a listing's photos (the bucket is public); only the family whose folder it is can change them.
create policy "families upload listing photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'listing-photos' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
create policy "families replace listing photos" on storage.objects
  for update to authenticated using (bucket_id = 'listing-photos' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
create policy "families delete listing photos" on storage.objects
  for delete to authenticated using (bucket_id = 'listing-photos' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));
create policy "families list their listing photos" on storage.objects
  for select to authenticated using (bucket_id = 'listing-photos' and public.is_family_member(public.try_uuid((storage.foldername(name))[1])));

-- ───────────────────────────── Conversations about a listing

-- The listing a conversation began with, when a buyer messaged a family seller.
alter table public.conversations add column market_listing text references public.listings (id) on delete set null;

-- Either family may write: connected in Community, or talking about a listing.
create or replace function public.can_message_family(me uuid, other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not public.blocked_between(me, other)
     and (public.connection_status(me, other) = 'connected'
          or exists (select 1 from public.conversations c
                      where c.family_a = least(me, other) and c.family_b = greatest(me, other) and c.market_listing is not null));
$$;

-- Checks, limits, and the write itself; shared by send_message() and message_seller().
create or replace function public.deliver_message(me uuid, to_family uuid, body text, listing text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  txt text := btrim(coalesce(body, ''));
  lim record;
  a uuid := least(me, to_family);
  b uuid := greatest(me, to_family);
  cid uuid;
  m public.messages;
begin
  if txt = '' then
    raise exception 'Write a message first' using errcode = '22023';
  end if;
  if char_length(txt) > 2000 then
    raise exception 'Messages can be up to 2,000 characters' using errcode = '22001';
  end if;
  -- One send at a time per family, so the limits can't be raced.
  perform pg_advisory_xact_lock(hashtext('freerange.send_message'), hashtext(me::text));
  select * into lim from public.message_limits();
  if (select count(*) from public.messages where sender_family = me and created_at > now() - interval '1 minute') >= lim.per_minute then
    raise exception 'You''re sending messages very quickly. Wait a minute and try again.' using errcode = '54000';
  end if;
  if (select count(*) from public.messages where sender_family = me and created_at > now() - interval '1 day') >= lim.per_day then
    raise exception 'You''ve reached today''s message limit. Try again tomorrow.' using errcode = '54000';
  end if;
  insert into public.conversations (family_a, family_b, market_listing) values (a, b, listing)
  on conflict (family_a, family_b) do update set market_listing = coalesce(public.conversations.market_listing, excluded.market_listing);
  select id into cid from public.conversations where family_a = a and family_b = b;
  insert into public.messages (conversation_id, sender_family, sender_user, body)
  values (cid, me, auth.uid(), txt)
  returning * into m;
  update public.conversations set last_message_at = m.created_at where id = cid;
  -- Writing a reply means you've read everything before it.
  insert into public.conversation_reads (conversation_id, family_id, last_read_at) values (cid, me, m.created_at)
  on conflict (conversation_id, family_id) do update set last_read_at = greatest(public.conversation_reads.last_read_at, excluded.last_read_at);
  return jsonb_build_object('id', m.id, 'conversation_id', cid, 'created_at', m.created_at, 'family_id', to_family);
end;
$$;

create or replace function public.send_message(to_family uuid, body text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.my_family_id();
begin
  if me is null then
    raise exception 'Finish setting up your family first' using errcode = '42501';
  end if;
  if btrim(coalesce(body, '')) = '' then
    raise exception 'Write a message first' using errcode = '22023';
  end if;
  if char_length(btrim(body)) > 2000 then
    raise exception 'Messages can be up to 2,000 characters' using errcode = '22001';
  end if;
  if to_family is null or to_family = me then
    raise exception 'Pick a family to message' using errcode = '22023';
  end if;
  if public.blocked_between(me, to_family) then
    raise exception 'You can''t message this family' using errcode = '42501';
  end if;
  if not public.can_message_family(me, to_family) then
    raise exception 'You can message a family once you''re connected' using errcode = '42501';
  end if;
  return public.deliver_message(me, to_family, body, null);
end;
$$;

-- A buyer asks the family selling a used curriculum about it (no Community connection needed).
create or replace function public.message_seller(listing text, body text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.my_family_id();
  l public.listings;
begin
  if me is null then
    raise exception 'Finish setting up your family first' using errcode = '42501';
  end if;
  select * into l from public.listings where id = listing and status = 'active';
  if not found then
    raise exception 'That listing isn''t available' using errcode = 'P0002';
  end if;
  if l.seller_kind <> 'family' or l.seller_family is null then
    raise exception 'Only families selling used curricula can be messaged here' using errcode = '22023';
  end if;
  if l.seller_family = me then
    raise exception 'This is your own listing' using errcode = '22023';
  end if;
  if public.blocked_between(me, l.seller_family) then
    raise exception 'You can''t message this family' using errcode = '42501';
  end if;
  return public.deliver_message(me, l.seller_family, body, l.id);
end;
$$;

-- This family's conversations, newest first, with unread counts and the listing a conversation is about.
drop function public.my_conversations();
create function public.my_conversations()
returns table (conversation_id uuid, family_id uuid, display_name text, verified boolean, last_body text, last_at timestamptz, last_from_me boolean, unread integer, can_message boolean, blocked boolean, listing_id text, listing_title text, seller boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select public.my_family_id() as fid)
  select c.id, o.fid,
         -- A family seller without a Community profile is shown by the name on their listing.
         coalesce(p.display_name, case when l.seller_family = o.fid then l.seller_name end, 'A Freerange family'),
         public.is_verified_family(o.fid),
         lm.body, lm.created_at, lm.sender_family = me.fid,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_family <> me.fid and not m.hidden
             and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         public.can_message_family(me.fid, o.fid),
         exists (select 1 from public.family_blocks fb where fb.blocker_family = me.fid and fb.blocked_family = o.fid),
         l.id, l.title,
         -- The other family is the one selling it.
         coalesce(l.seller_family = o.fid, false)
    from public.conversations c
    cross join me
    cross join lateral (select case when c.family_a = me.fid then c.family_b else c.family_a end as fid) o
    left join public.community_profiles p on p.family_id = o.fid
    left join public.listings l on l.id = c.market_listing
    left join public.conversation_reads r on r.conversation_id = c.id and r.family_id = me.fid
    left join lateral (
      select m.body, m.created_at, m.sender_family from public.messages m
       where m.conversation_id = c.id and (not m.hidden or m.sender_family = me.fid)
       order by m.created_at desc limit 1
    ) lm on true
   where me.fid in (c.family_a, c.family_b)
   order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- ───────────────────────────── Grants

revoke all on function public.deliver_message(uuid, uuid, text, text), public.can_message_family(uuid, uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text), public.message_seller(text, text), public.my_conversations() from public, anon;
grant execute on function public.send_message(uuid, text), public.message_seller(text, text), public.my_conversations() to authenticated;
