-- Freerange messages between families, verified families, and the
-- moderation log behind in-app notifications.
--
-- Messages: only families with an accepted connection can message each other,
-- and only those two families can read their conversation. Sending goes
-- through send_message(), which checks the connection, blocks, and rate
-- limits. A family can block another (which also removes the connection) and
-- report a message; moderators see only the reported message, never the
-- whole conversation. Kids never reach these screens.
--
-- Verified families: a status only moderators (or, later, an ID vendor's
-- webhook) can set, shown as a badge. Families ask with request_verification().
--
-- Notifications: moderation decisions about a family's listings, reviews,
-- messages, and verification are logged in moderation_events so the family
-- can be told in the app.

-- ───────────────────────────── Moderation log (for notifications)

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  -- The family being told about it.
  family_id uuid not null references public.families (id) on delete cascade,
  target_kind text not null check (target_kind in ('listing', 'review', 'message', 'verification')),
  target_id text not null,
  action text not null check (action in ('hidden', 'auto_hidden', 'restored', 'verified', 'declined', 'revoked')),
  title text not null default '' check (char_length(title) <= 200),
  created_at timestamptz not null default now()
);
create index moderation_events_family_idx on public.moderation_events (family_id, created_at desc);
alter table public.moderation_events enable row level security;
create policy "families see decisions about their things" on public.moderation_events
  for select to authenticated using (public.is_family_member(family_id));
grant select on public.moderation_events to authenticated;
alter publication supabase_realtime add table public.moderation_events;

-- ───────────────────────────── Verified families

-- Today a moderator checks a family by hand (for example a short video call)
-- and marks it verified. TODO(ID vendor): to use a real identity check such as
-- Stripe Identity, add an edge function that starts a verification session for
-- the signed-in parent, and a webhook (service role) that calls
-- record_vendor_verification() below with the vendor's result. No client code
-- changes beyond starting the session; see src/services/verification.ts.
create table public.family_verifications (
  family_id uuid primary key references public.families (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'declined', 'revoked')),
  -- How the family was checked: 'moderator' today, a vendor name (e.g. 'stripe_identity') later.
  method text not null default 'moderator' check (char_length(method) <= 40),
  -- What the family told the moderators when asking.
  note text not null default '' check (char_length(note) <= 500),
  -- The vendor's session or report id, once a vendor is plugged in.
  vendor_ref text check (vendor_ref is null or char_length(vendor_ref) <= 200),
  -- Kept with the decision (moderators only).
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);
alter table public.family_verifications enable row level security;
-- No policies or grants: only the functions below read or write it.

create or replace function public.is_verified_family(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.family_verifications where family_id = fid and status = 'verified');
$$;

create or replace function public.my_verification()
returns table (status text, requested_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select v.status, v.requested_at, v.decided_at
    from public.family_verifications v where v.family_id = public.my_family_id();
$$;

create or replace function public.request_verification(note text default '')
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.my_family_id();
  cur public.family_verifications;
begin
  if me is null then
    raise exception 'Finish setting up your family first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.community_profiles where family_id = me) then
    raise exception 'Join the community first' using errcode = '22023';
  end if;
  if not public.email_verified_family(me) then
    raise exception 'Confirm your email first' using errcode = '22023';
  end if;
  select * into cur from public.family_verifications where family_id = me for update;
  if found and cur.status = 'verified' then
    raise exception 'Your family is already verified' using errcode = '22023';
  end if;
  -- After a "not yet", wait a day before asking again.
  if found and cur.status in ('declined', 'revoked') and cur.decided_at > now() - interval '1 day' then
    raise exception 'You can ask again tomorrow' using errcode = '22023';
  end if;
  insert into public.family_verifications (family_id, status, method, note, requested_at)
  values (me, 'pending', 'moderator', left(btrim(coalesce(note, '')), 500), now())
  on conflict (family_id) do update
    set status = 'pending', method = 'moderator', note = excluded.note, requested_at = now(),
        vendor_ref = null, decision_note = null, decided_at = null, decided_by = null;
  return 'pending';
end;
$$;

create or replace function public.log_verification(fid uuid, decision text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.moderation_events (family_id, target_kind, target_id, action, title)
  values (fid, 'verification', fid::text, decision, coalesce((select display_name from public.community_profiles where family_id = fid), ''));
$$;

-- Moderators: verify, decline, or revoke.
create or replace function public.set_family_verification(fid uuid, decision text, note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  if decision not in ('verified', 'declined', 'revoked') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.families where id = fid) then
    raise exception 'That family isn''t available' using errcode = 'P0002';
  end if;
  insert into public.family_verifications (family_id, status, method, decision_note, decided_at, decided_by)
  values (fid, decision, 'moderator', left(note, 500), now(), auth.uid())
  on conflict (family_id) do update
    set status = excluded.status, method = 'moderator', decision_note = excluded.decision_note,
        decided_at = now(), decided_by = auth.uid();
  perform public.log_verification(fid, decision);
end;
$$;

-- For an ID vendor's webhook (service role only; not callable from the app).
create or replace function public.record_vendor_verification(fid uuid, vendor text, ref text, passed boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.family_verifications (family_id, status, method, vendor_ref, decided_at)
  values (fid, case when passed then 'verified' else 'declined' end, left(vendor, 40), left(ref, 200), now())
  on conflict (family_id) do update
    set status = excluded.status, method = excluded.method, vendor_ref = excluded.vendor_ref, decided_at = now(), decided_by = null;
  perform public.log_verification(fid, case when passed then 'verified' else 'declined' end);
end;
$$;

-- Pending requests, oldest first (moderators only).
create or replace function public.verification_queue()
returns table (family_id uuid, display_name text, bio text, note text, contact text, emails text, requested_at timestamptz, email_verified boolean, connections integer, family_since timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
  return query
  select v.family_id, coalesce(p.display_name, 'A Freerange family'), coalesce(p.bio, ''), v.note,
         coalesce(p.contact, ''),
         -- How the moderator reaches the family to set up the check.
         (select string_agg(u.email, ', ' order by m.joined_at) from public.family_members m join auth.users u on u.id = m.user_id where m.family_id = v.family_id),
         v.requested_at,
         public.email_verified_family(v.family_id),
         (select count(*)::integer from public.connections c where c.status = 'accepted' and v.family_id in (c.from_family, c.to_family)),
         f.created_at
    from public.family_verifications v
    join public.families f on f.id = v.family_id
    left join public.community_profiles p on p.family_id = v.family_id
   where v.status = 'pending'
   order by v.requested_at;
end;
$$;

-- ───────────────────────────── Blocks

create table public.family_blocks (
  blocker_family uuid not null references public.families (id) on delete cascade,
  blocked_family uuid not null references public.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_family, blocked_family),
  check (blocker_family <> blocked_family)
);
alter table public.family_blocks enable row level security;
create policy "families see who they blocked" on public.family_blocks
  for select to authenticated using (public.is_family_member(blocker_family));
create policy "families block" on public.family_blocks
  for insert to authenticated with check (public.is_family_member(blocker_family));
create policy "families unblock" on public.family_blocks
  for delete to authenticated using (public.is_family_member(blocker_family));
grant select, insert, delete on public.family_blocks to authenticated;

-- A report target id as a message id (null when it isn't one).
create or replace function public.as_uuid(t text)
returns uuid
language sql immutable
as $$
  select case when t ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then t::uuid end;
$$;

-- Either family blocked the other. Only used inside security-definer functions.
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_blocks
     where (blocker_family = a and blocked_family = b) or (blocker_family = b and blocked_family = a)
  );
$$;

-- Blocking also ends the connection, so the blocked family loses your contact details.
create or replace function public.family_blocks_disconnect()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.connections
   where (from_family = new.blocker_family and to_family = new.blocked_family)
      or (from_family = new.blocked_family and to_family = new.blocker_family);
  return new;
end;
$$;
create trigger family_blocks_disconnect after insert on public.family_blocks
  for each row execute function public.family_blocks_disconnect();

-- No connection requests either way while blocked.
create or replace function public.connections_block_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.blocked_between(new.from_family, new.to_family) then
    raise exception 'You can''t connect with this family' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger connections_block_guard before insert or update on public.connections
  for each row execute function public.connections_block_guard();

-- ───────────────────────────── Conversations & messages

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The two families, smaller id first, so each pair has one conversation.
  family_a uuid not null references public.families (id) on delete cascade,
  family_b uuid not null references public.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check (family_a < family_b),
  unique (family_a, family_b)
);
create index conversations_b_idx on public.conversations (family_b);

create or replace function public.in_conversation(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = cid and (public.is_family_member(c.family_a) or public.is_family_member(c.family_b))
  );
$$;

alter table public.conversations enable row level security;
create policy "the two families see their conversation" on public.conversations
  for select to authenticated using (public.is_family_member(family_a) or public.is_family_member(family_b));
grant select on public.conversations to authenticated;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_family uuid not null references public.families (id) on delete cascade,
  sender_user uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- Hidden by a moderator: the sender still sees it, the other family doesn't.
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_family, created_at desc);
alter table public.messages enable row level security;
create policy "only the two families read messages" on public.messages
  for select to authenticated
  using (public.in_conversation(conversation_id) and (not hidden or public.is_family_member(sender_family)));
-- No insert/update/delete grants: send_message() and moderation are the only writers.
grant select on public.messages to authenticated;
alter publication supabase_realtime add table public.messages;

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, family_id)
);
alter table public.conversation_reads enable row level security;
create policy "families see their read marks" on public.conversation_reads
  for select to authenticated using (public.is_family_member(family_id));
grant select on public.conversation_reads to authenticated;

-- Sending limits per family, across all conversations.
create or replace function public.message_limits()
returns table (per_minute integer, per_day integer)
language sql immutable
as $$ select 10, 200 $$;

create or replace function public.send_message(to_family uuid, body text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.my_family_id();
  txt text := btrim(coalesce(body, ''));
  lim record;
  a uuid;
  b uuid;
  cid uuid;
  m public.messages;
begin
  if me is null then
    raise exception 'Finish setting up your family first' using errcode = '42501';
  end if;
  if txt = '' then
    raise exception 'Write a message first' using errcode = '22023';
  end if;
  if char_length(txt) > 2000 then
    raise exception 'Messages can be up to 2,000 characters' using errcode = '22001';
  end if;
  if to_family is null or to_family = me then
    raise exception 'Pick a family to message' using errcode = '22023';
  end if;
  if public.blocked_between(me, to_family) then
    raise exception 'You can''t message this family' using errcode = '42501';
  end if;
  if public.connection_status(me, to_family) <> 'connected' then
    raise exception 'You can message a family once you''re connected' using errcode = '42501';
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

  a := least(me, to_family);
  b := greatest(me, to_family);
  insert into public.conversations (family_a, family_b) values (a, b) on conflict (family_a, family_b) do nothing;
  select id into cid from public.conversations where family_a = a and family_b = b;

  insert into public.messages (conversation_id, sender_family, sender_user, body)
  values (cid, me, auth.uid(), txt)
  returning * into m;
  update public.conversations set last_message_at = m.created_at where id = cid;
  -- Writing a reply means you've read everything before it.
  insert into public.conversation_reads (conversation_id, family_id, last_read_at) values (cid, me, m.created_at)
  on conflict (conversation_id, family_id) do update set last_read_at = greatest(public.conversation_reads.last_read_at, excluded.last_read_at);
  return jsonb_build_object('id', m.id, 'conversation_id', cid, 'created_at', m.created_at);
end;
$$;

create or replace function public.mark_conversation_read(cid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.my_family_id();
begin
  if me is null or not public.in_conversation(cid) then
    raise exception 'That conversation isn''t available' using errcode = 'P0002';
  end if;
  insert into public.conversation_reads (conversation_id, family_id, last_read_at) values (cid, me, now())
  on conflict (conversation_id, family_id) do update set last_read_at = now();
end;
$$;

-- This family's conversations, newest first, with unread counts.
create or replace function public.my_conversations()
returns table (conversation_id uuid, family_id uuid, display_name text, verified boolean, last_body text, last_at timestamptz, last_from_me boolean, unread integer, can_message boolean, blocked boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select public.my_family_id() as fid)
  select c.id, o.fid, coalesce(p.display_name, 'A Freerange family'), public.is_verified_family(o.fid),
         lm.body, lm.created_at, lm.sender_family = me.fid,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_family <> me.fid and not m.hidden
             and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         public.connection_status(me.fid, o.fid) = 'connected' and not public.blocked_between(me.fid, o.fid),
         exists (select 1 from public.family_blocks fb where fb.blocker_family = me.fid and fb.blocked_family = o.fid)
    from public.conversations c
    cross join me
    cross join lateral (select case when c.family_a = me.fid then c.family_b else c.family_a end as fid) o
    left join public.community_profiles p on p.family_id = o.fid
    left join public.conversation_reads r on r.conversation_id = c.id and r.family_id = me.fid
    left join lateral (
      select m.body, m.created_at, m.sender_family from public.messages m
       where m.conversation_id = c.id and (not m.hidden or m.sender_family = me.fid)
       order by m.created_at desc limit 1
    ) lm on true
   where me.fid in (c.family_a, c.family_b)
   order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- ───────────────────────────── Finder and connections show the verified badge

drop function public.nearby_families(integer, integer, integer, text);
create function public.nearby_families(max_miles integer default 25, age_min integer default null, age_max integer default null, style text default null)
returns table (family_id uuid, display_name text, bio text, kid_ages smallint[], philosophies text[], interests text[], band text, miles_rounded integer, email_verified boolean, connection text, verified boolean)
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
         public.is_verified_family(p.family_id)
    from public.community_profiles p
    join public.family_locations l on l.family_id = p.family_id
    cross join me
    cross join lateral (select public.zip_miles((select zip5 from here), l.zip5) as miles) d
   where me.fid is not null
     and p.family_id <> me.fid
     and p.visible
     -- Blocked families don't see each other.
     and not public.blocked_between(me.fid, p.family_id)
     and d.miles is not null and d.miles <= max_miles
     and (age_min is null or exists (select 1 from unnest(p.kid_ages) a where a between age_min and coalesce(age_max, 99)))
     and (style is null or style = any (p.philosophies))
   order by d.miles, p.display_name
   limit 100;
$$;

drop function public.my_connections();
create function public.my_connections()
returns table (family_id uuid, display_name text, status text, direction text, message text, contact text, kid_ages smallint[], band text, verified boolean)
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
           (select zip5 from public.family_locations where family_id = other.family_id))),
         public.is_verified_family(other.family_id)
    from public.connections c
    cross join me
    cross join lateral (select case when c.from_family = me.fid then c.to_family else c.from_family end as family_id) other
    left join public.community_profiles p on p.family_id = other.family_id
   where me.fid in (c.from_family, c.to_family) and c.status <> 'declined'
   order by c.created_at desc;
$$;

-- ───────────────────────────── Reports and moderation cover messages

alter table public.reports drop constraint reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check check (target_kind in ('listing', 'review', 'message'));

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
  else
    raise exception 'Unknown report' using errcode = '22023';
  end if;

  insert into public.reports (target_kind, target_id, listing_id, reason, details, contact, reporter_user)
  values (kind, target, lid, why, left(coalesce(info, ''), 2000), nullif(left(btrim(coalesce(reach, '')), 200), ''), uid)
  on conflict (target_kind, target_id, reporter_user) do update
    set reason = excluded.reason, details = excluded.details, contact = excluded.contact, status = 'open', created_at = now(),
        resolution = null, resolved_by = null, resolved_at = null;

  -- Messages wait for a moderator (only one family can ever report them).
  if kind = 'message' then
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
         case when p.target_kind = 'message' then 'Message from ' || coalesce(sp.display_name, 'a Freerange family') else coalesce(l.title, '') end,
         case p.target_kind
           when 'review' then left(coalesce(nullif(rv.title, '') || ': ', '') || rv.body, 280)
           when 'message' then left(coalesce(ms.body, ''), 280)
           else left(coalesce(l.description, ''), 280) end,
         case p.target_kind
           when 'review' then rv.author_name
           when 'message' then coalesce(sp.display_name, 'A Freerange family')
           else l.seller_name end,
         case p.target_kind
           when 'review' then (case when rv.hidden then 'hidden' else 'visible' end)
           when 'message' then (case when ms.hidden then 'hidden' else 'visible' end)
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
   where p.status = 'open'
   group by p.target_kind, p.target_id, p.listing_id, l.title, l.description, l.seller_name, l.status, rv.title, rv.body, rv.author_name, rv.hidden, ms.body, ms.hidden, sp.display_name
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
  if action not in ('hide', 'restore', 'dismiss') or kind not in ('listing', 'review', 'message') then
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

-- ───────────────────────────── Grants

revoke all on function public.blocked_between(uuid, uuid), public.log_verification(uuid, text), public.record_vendor_verification(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_vendor_verification(uuid, text, text, boolean) to service_role;
revoke all on function
  public.my_verification(), public.request_verification(text), public.set_family_verification(uuid, text, text), public.verification_queue(),
  public.send_message(uuid, text), public.mark_conversation_read(uuid), public.my_conversations(),
  public.nearby_families(integer, integer, integer, text), public.my_connections()
  from public, anon;
grant execute on function
  public.my_verification(), public.request_verification(text), public.set_family_verification(uuid, text, text), public.verification_queue(),
  public.send_message(uuid, text), public.mark_conversation_read(uuid), public.my_conversations(),
  public.nearby_families(integer, integer, integer, text), public.my_connections()
  to authenticated;
