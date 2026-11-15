-- Freerange: co-op classes, gifts, and creator promotions (sales, bundles,
-- coupon codes).
--
-- Co-op classes: a Studio teacher shares a class plan with up to 30 families
-- through an invite code. Each family schedules it at its own pace; the
-- teacher pushes new versions (families update like any plan update) and sees
-- a roster of how far each family has got. Child names only reach the teacher
-- if the family opts in.
--
-- Prices are always computed here, never taken from the app: listing price,
-- the creator's sale, bundle price, and coupon code. The checkout function
-- records orders through checkout_record(), which reprices everything.
--
-- Gifts: buy (or, for free curricula, just send) a curriculum for another
-- family by email or to a connected family. The recipient claims it with a
-- one-time code. Freerange doesn't send email yet, so the giver shares the
-- code or link themselves (seam: an email provider can send it from
-- gifts.recipient_email later).

-- ───────────────────────────── Helpers

create or replace function public.random_invite_code(len integer)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text := '';
begin
  for i in 1..len loop
    c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
  end loop;
  return c;
end;
$$;
revoke all on function public.random_invite_code(integer) from public, anon, authenticated;

-- How a family appears to other families (gift senders, co-op teachers).
create or replace function public.family_display_name(fid uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select display_name from public.community_profiles where family_id = fid),
    (select name from public.families where id = fid),
    'A Freerange family');
$$;
revoke all on function public.family_display_name(uuid) from public, anon, authenticated;

-- ───────────────────────────── Sales

alter table public.listings
  add column sale_percent smallint check (sale_percent between 5 and 90),
  add column sale_ends_at timestamptz,
  add constraint listings_sale_check check ((sale_percent is null) = (sale_ends_at is null));

-- Put a listing on sale (or end the sale with pct = null). Creators and family sellers only.
create or replace function public.set_listing_sale(lid text, pct integer, ends timestamptz)
returns public.listings
language plpgsql security definer set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = lid;
  if not found or not (l.creator_user = auth.uid() or public.is_family_member(l.seller_family)) then
    raise exception 'That listing isn''t yours' using errcode = '42501';
  end if;
  if pct is not null then
    if pct < 5 or pct > 90 then
      raise exception 'A sale is between 5%% and 90%% off' using errcode = '22023';
    end if;
    if ends is null or ends <= now() or ends > now() + interval '1 year' then
      raise exception 'Choose an end date within the next year' using errcode = '22023';
    end if;
    if l.price = 0 then
      raise exception 'Free curricula can''t go on sale' using errcode = '22023';
    end if;
  end if;
  update public.listings
     set sale_percent = pct::smallint, sale_ends_at = case when pct is null then null else ends end
   where id = lid
  returning * into l;
  return l;
end;
$$;
revoke all on function public.set_listing_sale(text, integer, timestamptz) from public, anon;
grant execute on function public.set_listing_sale(text, integer, timestamptz) to authenticated;

-- ───────────────────────────── Bundles

create table public.bundles (
  id text primary key default gen_random_uuid()::text,
  creator_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seller_name text not null default '' check (char_length(seller_name) <= 80),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  listing_ids text[] not null check (cardinality(listing_ids) between 2 and 20),
  price numeric(10, 2) not null check (price >= 0 and price <= 10000),
  cover text not null default '🎁',
  color text not null default '#2F6B5E',
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bundles_creator_idx on public.bundles (creator_user);

alter table public.bundles enable row level security;
create policy "anyone browses active bundles" on public.bundles
  for select to anon, authenticated using (status = 'active' or creator_user = auth.uid());
create policy "creators add bundles" on public.bundles
  for insert to authenticated with check (creator_user = auth.uid());
create policy "creators edit bundles" on public.bundles
  for update to authenticated using (creator_user = auth.uid()) with check (creator_user = auth.uid());
create policy "creators delete bundles" on public.bundles
  for delete to authenticated using (creator_user = auth.uid());
grant select on public.bundles to anon, authenticated;
grant insert, update, delete on public.bundles to authenticated;

-- Bundles hold only the creator's own active listings, and cost less than buying them one by one.
create or replace function public.bundles_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
  total numeric;
begin
  if tg_op = 'UPDATE' then
    new.creator_user := old.creator_user;
    new.created_at := old.created_at;
  end if;
  if (select count(distinct x) from unnest(new.listing_ids) x) <> cardinality(new.listing_ids) then
    raise exception 'Each curriculum can be in a bundle only once' using errcode = '22023';
  end if;
  select count(*), coalesce(sum(price), 0) into n, total
    from public.listings
   where id = any (new.listing_ids) and creator_user = new.creator_user and status = 'active';
  if n <> cardinality(new.listing_ids) then
    raise exception 'Bundles can only include your own published curricula' using errcode = '42501';
  end if;
  if total > 0 and new.price >= total then
    raise exception 'A bundle has to cost less than buying its curricula separately ($%)', total using errcode = '22023';
  end if;
  if total = 0 then
    new.price := 0;
  end if;
  new.seller_name := coalesce((select name from public.creator_profiles where user_id = new.creator_user), new.seller_name);
  new.updated_at := now();
  return new;
end;
$$;
create trigger bundles_check before insert or update on public.bundles
  for each row execute function public.bundles_check();

-- ───────────────────────────── Coupons

create table public.coupons (
  id text primary key default gen_random_uuid()::text,
  creator_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  amount numeric(10, 2) not null check (amount > 0 and amount <= 10000),
  -- One curriculum, or (null) every curriculum and bundle in the creator's shop.
  listing_id text references public.listings (id) on delete cascade,
  max_uses integer check (max_uses is null or max_uses between 1 and 100000),
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (creator_user, code),
  check (kind <> 'percent' or amount <= 100)
);

alter table public.coupons enable row level security;
-- Codes are the creator's secret: buyers only ever type them in at checkout.
create policy "creators see their coupons" on public.coupons
  for select to authenticated using (creator_user = auth.uid());
create policy "creators add coupons" on public.coupons
  for insert to authenticated with check (creator_user = auth.uid());
create policy "creators edit coupons" on public.coupons
  for update to authenticated using (creator_user = auth.uid()) with check (creator_user = auth.uid());
create policy "creators delete coupons" on public.coupons
  for delete to authenticated using (creator_user = auth.uid());
grant select, insert, update, delete on public.coupons to authenticated;

create or replace function public.coupons_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  -- Use counts only change at checkout.
  if coalesce(current_setting('freerange.checkout', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.uses := 0;
      new.created_at := now();
    else
      new.uses := old.uses;
      new.creator_user := old.creator_user;
      new.created_at := old.created_at;
    end if;
  end if;
  if new.listing_id is not null and not exists (select 1 from public.listings where id = new.listing_id and creator_user = new.creator_user) then
    raise exception 'Coupons can only be for your own curricula' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger coupons_check before insert or update on public.coupons
  for each row execute function public.coupons_check();

-- ───────────────────────────── Gifts

create table public.gifts (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  listing_id text references public.listings (id) on delete set null,
  title text not null,
  seller text not null,
  giver_family uuid not null references public.families (id) on delete cascade,
  giver_user uuid references auth.users (id) on delete set null,
  giver_name text not null,
  recipient_email text check (recipient_email is null or (char_length(recipient_email) <= 254 and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  recipient_family uuid references public.families (id) on delete set null,
  -- How the giver sees who it's for.
  recipient_label text not null default '',
  note text not null default '' check (char_length(note) <= 500),
  price numeric(10, 2) not null default 0,
  list_price numeric(10, 2) not null default 0,
  coupon_id text references public.coupons (id) on delete set null,
  status text not null check (status in ('pending', 'ready', 'claimed', 'cancelled')),
  demo boolean not null default false,
  provider_session text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  claimed_at timestamptz,
  claimed_family uuid references public.families (id) on delete set null
);
create index gifts_giver_idx on public.gifts (giver_family, created_at desc);
create index gifts_recipient_family_idx on public.gifts (recipient_family) where status = 'ready';
create index gifts_recipient_email_idx on public.gifts (lower(recipient_email)) where status = 'ready';

alter table public.gifts enable row level security;
create policy "givers see the gifts they sent" on public.gifts
  for select to authenticated using (public.is_family_member(giver_family));
grant select on public.gifts to authenticated;
-- Created through send_gift() and the checkout function; claimed through claim_gift().

-- ───────────────────────────── Orders on purchases

alter table public.purchases
  -- Purchases bought together (a bundle) share an order id: the first row's id, which holds the Stripe session.
  add column order_id text,
  add column bundle_id text references public.bundles (id) on delete set null,
  add column coupon_id text references public.coupons (id) on delete set null,
  -- Price before the sale, bundle, and coupon.
  add column list_price numeric(10, 2),
  add column gift_id text references public.gifts (id) on delete set null,
  add column gift_from text;
create index purchases_order_idx on public.purchases (order_id) where order_id is not null;

-- ───────────────────────────── Pricing

-- The price of a listing or bundle for one family, with sales, bundle price,
-- and coupon applied. Raises if it can't be bought (unavailable, your own,
-- a bad coupon). Internal: buyers call price_quote(), checkout calls checkout_record().
create or replace function public.quote_order(target_kind text, target_id text, coupon_code text, fid uuid, buyer uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.listings;
  b public.bundles;
  cp public.coupons;
  creator uuid;
  items jsonb := '[]'::jsonb;
  owned text[] := '{}';
  list_total numeric := 0;
  price numeric := 0;
  sale integer;
  discount numeric := 0;
  total numeric;
  share numeric;
  left_over numeric;
  n integer;
  i integer := 0;
  title text;
  seller text;
  sale_ends timestamptz;
  item record;
  out_items jsonb := '[]'::jsonb;
begin
  if target_kind = 'listing' then
    select * into l from public.listings where id = target_id and status = 'active';
    if not found then
      raise exception 'That listing is no longer available' using errcode = 'P0002';
    end if;
    if (fid is not null and l.seller_family = fid) or (buyer is not null and l.creator_user = buyer) then
      raise exception 'You can''t buy your own listing' using errcode = '42501';
    end if;
    creator := l.creator_user;
    title := l.title;
    seller := l.seller_name;
    list_total := l.price;
    if l.sale_percent is not null and l.sale_ends_at > now() then
      sale := l.sale_percent;
      sale_ends := l.sale_ends_at;
    end if;
    price := round(l.price * (100 - coalesce(sale, 0)) / 100, 2);
    items := jsonb_build_array(jsonb_build_object('listing_id', l.id, 'title', l.title, 'seller', l.seller_name, 'esa_eligible', l.esa_eligible, 'list_price', l.price, 'weight', price));
  elsif target_kind = 'bundle' then
    select * into b from public.bundles where id = target_id and status = 'active';
    if not found then
      raise exception 'That bundle is no longer available' using errcode = 'P0002';
    end if;
    if buyer is not null and b.creator_user = buyer then
      raise exception 'You can''t buy your own bundle' using errcode = '42501';
    end if;
    creator := b.creator_user;
    title := b.title;
    seller := b.seller_name;
    for item in
      select x.id, x.title, x.seller_name, x.esa_eligible, x.price,
             round(x.price * (100 - case when x.sale_percent is not null and x.sale_ends_at > now() then x.sale_percent else 0 end) / 100, 2) as now_price,
             (fid is not null and public.owns_listing(fid, x.id)) as have
        from unnest(b.listing_ids) with ordinality u(lid, ord)
        join public.listings x on x.id = u.lid and x.status = 'active'
       order by u.ord
    loop
      if item.have then
        owned := owned || item.id;
      else
        list_total := list_total + item.price;
        price := price + item.now_price;
        items := items || jsonb_build_object('listing_id', item.id, 'title', item.title, 'seller', item.seller_name, 'esa_eligible', item.esa_eligible, 'list_price', item.price, 'weight', item.price);
      end if;
    end loop;
    if jsonb_array_length(items) = 0 then
      raise exception 'You already have everything in this bundle' using errcode = '23505';
    end if;
    -- The bundle price, unless the curricula still needed cost less on their own.
    price := least(b.price, price);
  else
    raise exception 'Unknown item' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(coupon_code, '')), '') is not null then
    select * into cp from public.coupons c
     where c.creator_user = creator and c.code = upper(btrim(coupon_code)) and c.active;
    if not found or creator is null or (cp.listing_id is not null and (target_kind <> 'listing' or cp.listing_id <> target_id)) then
      raise exception 'That coupon code doesn''t work for this curriculum' using errcode = '22023';
    end if;
    if cp.expires_at is not null and cp.expires_at <= now() then
      raise exception 'That coupon code has expired' using errcode = '22023';
    end if;
    if cp.max_uses is not null and cp.uses >= cp.max_uses then
      raise exception 'That coupon code has been used up' using errcode = '22023';
    end if;
    discount := case when cp.kind = 'percent' then round(price * cp.amount / 100, 2) else least(cp.amount, price) end;
  end if;
  total := greatest(price - discount, 0);

  -- Split the total across the curricula (by list price), so each sale is recorded at what it brought in.
  n := jsonb_array_length(items);
  left_over := total;
  for item in select value as v from jsonb_array_elements(items) loop
    i := i + 1;
    if i = n then
      share := left_over;
    else
      share := case when (select sum((x ->> 'weight')::numeric) from jsonb_array_elements(items) x) > 0
                    then round(total * (item.v ->> 'weight')::numeric / (select sum((x ->> 'weight')::numeric) from jsonb_array_elements(items) x), 2)
                    else 0 end;
      share := least(share, left_over);
    end if;
    left_over := left_over - share;
    out_items := out_items || ((item.v - 'weight') || jsonb_build_object('price', share));
  end loop;

  return jsonb_build_object(
    'kind', target_kind, 'id', target_id, 'title', title, 'seller', seller,
    'list_price', list_total, 'sale_percent', sale, 'sale_ends_at', sale_ends, 'price', price,
    'coupon_id', cp.id, 'coupon_code', cp.code, 'discount', discount, 'total', total,
    'items', out_items, 'owned', to_jsonb(owned));
end;
$$;
revoke all on function public.quote_order(text, text, text, uuid, uuid) from public, anon, authenticated;

-- What this family would pay (shown at checkout; the checkout function reprices on its own).
create or replace function public.price_quote(target_kind text, target_id text, coupon_code text default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public.quote_order(target_kind, target_id, coupon_code, public.my_family_id(), auth.uid());
$$;
revoke all on function public.price_quote(text, text, text) from public, anon;
grant execute on function public.price_quote(text, text, text) to authenticated;

-- ───────────────────────────── Gifts: creating, claiming

create or replace function public.create_gift(q jsonb, fid uuid, giver uuid, to_email text, to_family uuid, gift_note text, st text, is_demo boolean)
returns public.gifts
language plpgsql security definer set search_path = ''
as $$
declare
  g public.gifts;
  email text := nullif(lower(btrim(coalesce(to_email, ''))), '');
  c text;
begin
  if q ->> 'kind' <> 'listing' then
    raise exception 'Gifts are for single curricula' using errcode = '22023';
  end if;
  if (email is null) = (to_family is null) then
    raise exception 'Choose who the gift is for: an email address or a connected family' using errcode = '22023';
  end if;
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address doesn''t look right' using errcode = '22023';
  end if;
  if email is not null and email = lower((select u.email from auth.users u where u.id = giver)) then
    raise exception 'That''s your own email address' using errcode = '22023';
  end if;
  if to_family is not null then
    if to_family = fid then
      raise exception 'Gifts are for other families' using errcode = '22023';
    end if;
    if public.connection_status(fid, to_family) <> 'connected' then
      raise exception 'You can send gifts to families you''re connected with' using errcode = '42501';
    end if;
    if public.owns_listing(to_family, q ->> 'id') then
      raise exception 'They already have this curriculum' using errcode = '23505';
    end if;
  end if;
  if char_length(coalesce(gift_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.gifts where giver_family = fid and created_at > now() - interval '1 day') >= 50 then
    raise exception 'That''s a lot of gifts for one day. Try again tomorrow.' using errcode = '54000';
  end if;
  loop
    c := public.random_invite_code(10);
    exit when not exists (select 1 from public.gifts where code = c);
  end loop;
  insert into public.gifts (code, listing_id, title, seller, giver_family, giver_user, giver_name, recipient_email, recipient_family, recipient_label, note, price, list_price, coupon_id, status, demo, paid_at)
  values (c, q ->> 'id', q ->> 'title', q ->> 'seller', fid, giver, public.family_display_name(fid), email, to_family,
          coalesce(email, public.family_display_name(to_family)), btrim(coalesce(gift_note, '')),
          (q ->> 'total')::numeric, (q ->> 'list_price')::numeric, q ->> 'coupon_id', st, coalesce(is_demo, false),
          case when st = 'ready' then now() end)
  returning * into g;
  return g;
end;
$$;
revoke all on function public.create_gift(jsonb, uuid, uuid, text, uuid, text, text, boolean) from public, anon, authenticated;

-- Send a free curriculum to another family (paid gifts go through checkout).
create or replace function public.send_gift(lid text, to_email text default null, to_family uuid default null, gift_note text default '')
returns public.gifts
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  q jsonb;
begin
  if fid is null then
    raise exception 'Create or join a family first' using errcode = '42501';
  end if;
  q := public.quote_order('listing', lid, null, null, null);
  if (q ->> 'total')::numeric > 0 then
    raise exception 'This curriculum isn''t free. Buy it as a gift at checkout.' using errcode = '22023';
  end if;
  return public.create_gift(q, fid, auth.uid(), to_email, to_family, gift_note, 'ready', false);
end;
$$;
revoke all on function public.send_gift(text, text, uuid, text) from public, anon;
grant execute on function public.send_gift(text, text, uuid, text) to authenticated;

-- Gifts waiting for this family: sent to the family, or to this account's confirmed email.
create or replace function public.my_gifts()
returns table (id text, code text, listing_id text, title text, seller text, giver_name text, note text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.code, g.listing_id, g.title, g.seller, g.giver_name, g.note, g.created_at
    from public.gifts g
   where g.status = 'ready'
     and (g.recipient_family = public.my_family_id()
          or lower(g.recipient_email) = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null))
   order by g.created_at desc;
$$;
revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

-- What a gift link holds, before claiming it.
create or replace function public.gift_preview(gift_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('title', g.title, 'listing_id', g.listing_id, 'seller', g.seller, 'giver_name', g.giver_name, 'note', g.note,
                            'status', g.status, 'for_family', g.recipient_family is not null)
    from public.gifts g
   where g.code = upper(btrim(gift_code)) and auth.uid() is not null;
$$;
revoke all on function public.gift_preview(text) from public, anon;
grant execute on function public.gift_preview(text) to authenticated;

-- Claim a gift with its one-time code: it lands in this family's library.
create or replace function public.claim_gift(gift_code text)
returns public.purchases
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  g public.gifts;
  l public.listings;
  p public.purchases;
begin
  if fid is null then
    raise exception 'Create or join a family first' using errcode = '42501';
  end if;
  select * into g from public.gifts where code = upper(btrim(coalesce(gift_code, ''))) for update;
  if not found or g.status in ('cancelled', 'pending') then
    raise exception 'That gift code isn''t valid' using errcode = 'P0002';
  end if;
  if g.status = 'claimed' then
    if g.claimed_family = fid then
      select * into p from public.purchases where gift_id = g.id and family_id = fid;
      if found then
        return p;
      end if;
    end if;
    raise exception 'That gift has already been claimed' using errcode = '23505';
  end if;
  if g.giver_family = fid then
    raise exception 'This gift is for another family. Share the code with them.' using errcode = '42501';
  end if;
  if g.recipient_family is not null and g.recipient_family <> fid then
    raise exception 'This gift is for another family' using errcode = '42501';
  end if;
  if public.owns_listing(fid, g.listing_id) then
    raise exception 'You already have this curriculum, so the gift is still unclaimed. Let the giver know.' using errcode = '23505';
  end if;
  select * into l from public.listings where id = g.listing_id;
  -- The purchase carries what the giver paid (so creators see the sale); the app shows it as a gift.
  insert into public.purchases (family_id, listing_id, title, seller, price, list_price, funding_source, status, demo, esa_eligible, paid_at, gift_id, gift_from, coupon_id)
  values (fid, g.listing_id, g.title, g.seller, g.price, g.list_price, 'out_of_pocket', case when g.price > 0 then 'paid' else 'free' end,
          g.demo, coalesce(l.esa_eligible, false), now(), g.id, g.giver_name, g.coupon_id)
  returning * into p;
  update public.gifts set status = 'claimed', claimed_at = now(), claimed_family = fid where id = g.id;
  return p;
end;
$$;
revoke all on function public.claim_gift(text) from public, anon;
grant execute on function public.claim_gift(text) to authenticated;

-- Take back a free gift nobody has claimed yet. (Paid ones wait for refunds, which need real payments.)
create or replace function public.cancel_gift(gid text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.gifts set status = 'cancelled'
   where id = gid and public.is_family_member(giver_family) and status = 'ready' and price = 0;
  if not found then
    raise exception 'Only unclaimed free gifts can be taken back' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.cancel_gift(text) from public, anon;
grant execute on function public.cancel_gift(text) to authenticated;

-- ───────────────────────────── Checkout (service role: the create-checkout and stripe-webhook functions)

-- Record an order at the server's price. pay_status: 'paid' (demo payments),
-- 'pending' (waiting on Stripe). A total of $0 (a 100% coupon) is free right away.
-- Returns { order_id, total, purchases | gift }.
create or replace function public.checkout_record(
  buyer_family uuid, buyer_user uuid, target_kind text, target_id text, coupon_code text,
  funding text, pay_status text, is_demo boolean, gift jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  q jsonb;
  st text;
  new_order text := gen_random_uuid()::text;
  g public.gifts;
  item jsonb;
  is_first boolean := true;
  out_rows jsonb := '[]'::jsonb;
  p public.purchases;
  to_family uuid := nullif(gift ->> 'family_id', '')::uuid;
begin
  if pay_status not in ('paid', 'pending') or funding not in ('esa', 'tax', 'out_of_pocket') then
    raise exception 'Bad request' using errcode = '22023';
  end if;
  q := public.quote_order(target_kind, target_id, coupon_code, buyer_family, buyer_user);
  if gift is null and target_kind = 'listing' and public.owns_listing(buyer_family, target_id) then
    select * into p from public.purchases where family_id = buyer_family and listing_id = target_id and status in ('paid', 'free') limit 1;
    return jsonb_build_object('order_id', p.id, 'total', 0, 'owned', true, 'purchases', jsonb_build_array(to_jsonb(p)));
  end if;
  st := case when (q ->> 'total')::numeric = 0 then 'free' else pay_status end;

  perform set_config('freerange.checkout', 'on', true);
  if q ->> 'coupon_id' is not null then
    update public.coupons set uses = uses + 1 where id = q ->> 'coupon_id';
  end if;

  if gift is not null then
    -- Gifts aren't paid with ESA funds.
    g := public.create_gift(q, buyer_family, buyer_user, gift ->> 'email', to_family, gift ->> 'note', case when st = 'pending' then 'pending' else 'ready' end, is_demo and st = 'paid');
    return jsonb_build_object('order_id', g.id, 'total', q -> 'total', 'gift', to_jsonb(g));
  end if;

  for item in select value from jsonb_array_elements(q -> 'items') loop
    insert into public.purchases (id, order_id, family_id, listing_id, title, seller, price, list_price, funding_source, status, demo, esa_eligible, paid_at, bundle_id, coupon_id)
    values (case when is_first then new_order else gen_random_uuid()::text end, new_order, buyer_family, item ->> 'listing_id', item ->> 'title', item ->> 'seller',
            (item ->> 'price')::numeric, (item ->> 'list_price')::numeric, case when st = 'free' then 'out_of_pocket' else funding end, st,
            is_demo and st = 'paid', (item ->> 'esa_eligible')::boolean, case when st <> 'pending' then now() end,
            case when target_kind = 'bundle' then target_id end, case when is_first then q ->> 'coupon_id' end)
    returning * into p;
    out_rows := out_rows || to_jsonb(p);
    is_first := false;
  end loop;
  return jsonb_build_object('order_id', new_order, 'total', q -> 'total', 'title', q -> 'title', 'purchases', out_rows);
end;
$$;
revoke all on function public.checkout_record(uuid, uuid, text, text, text, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.checkout_record(uuid, uuid, text, text, text, text, text, boolean, jsonb) to service_role;

-- Stripe finished (paid) or gave up (not paid) on a session; `order_ref` cancels an
-- order whose session never started. Settles every purchase in the order, or the gift.
create or replace function public.settle_order(sid text, paid boolean, order_ref text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lead_row public.purchases;
  g public.gifts;
begin
  perform set_config('freerange.checkout', 'on', true);
  select * into lead_row from public.purchases where (sid is not null and provider_session = sid) or (order_ref is not null and id = order_ref) limit 1;
  if found and lead_row.status = 'pending' then
    update public.purchases
       set status = case when paid then 'paid' else 'cancelled' end, paid_at = case when paid then now() end
     where status = 'pending' and (id = lead_row.id or order_id = coalesce(lead_row.order_id, lead_row.id));
    if not paid and lead_row.coupon_id is not null then
      update public.coupons set uses = greatest(uses - 1, 0) where id = lead_row.coupon_id;
    end if;
  end if;
  select * into g from public.gifts where ((sid is not null and provider_session = sid) or (order_ref is not null and id = order_ref)) and status = 'pending';
  if found then
    update public.gifts set status = case when paid then 'ready' else 'cancelled' end, paid_at = case when paid then now() end where id = g.id;
    if not paid and g.coupon_id is not null then
      update public.coupons set uses = greatest(uses - 1, 0) where id = g.coupon_id;
    end if;
  end if;
end;
$$;
revoke all on function public.settle_order(text, boolean, text) from public, anon, authenticated;
grant execute on function public.settle_order(text, boolean, text) to service_role;

-- ───────────────────────────── Co-op classes

create table public.coop_classes (
  id text primary key default gen_random_uuid()::text,
  teacher_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  teacher_name text not null,
  -- The teacher's Studio curriculum the class follows.
  package_id text,
  code text not null unique,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  subjects text[] not null default '{}',
  grade_min smallint not null default 1,
  grade_max smallint not null default 3,
  lessons_per_week smallint not null default 3,
  minutes_per_lesson smallint not null default 30,
  parent_involvement text not null default 'medium',
  family_style boolean not null default false,
  cover text not null default '📘',
  color text not null default '#2F6B5E',
  max_families smallint not null default 30 check (max_families between 1 and 30),
  status text not null default 'open' check (status in ('open', 'closed')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coop_classes_teacher_idx on public.coop_classes (teacher_user);
alter table public.coop_classes enable row level security;
create policy "teachers see their classes" on public.coop_classes
  for select to authenticated using (teacher_user = auth.uid());
grant select on public.coop_classes to authenticated;

create table public.coop_class_releases (
  class_id text not null references public.coop_classes (id) on delete cascade,
  version integer not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (class_id, version)
);
alter table public.coop_class_releases enable row level security;
-- No policies: read through coop_class_content().

create table public.coop_class_members (
  class_id text not null references public.coop_classes (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  family_label text not null check (char_length(family_label) between 1 and 60),
  -- The teacher sees kids' first names only when the family turns this on.
  share_names boolean not null default false,
  -- [{ "done": 12, "name": "Ava" }] per student; names stripped unless shared.
  progress jsonb not null default '[]'::jsonb,
  total_lessons integer,
  on_version integer,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id, family_id)
);
create index coop_class_members_family_idx on public.coop_class_members (family_id);
alter table public.coop_class_members enable row level security;
-- No policies: families and teachers go through the functions below.

-- Build a class release from the teacher's package (license rules mirror publishing).
create or replace function public.coop_release_from(pkg public.packages)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c jsonb := pkg.content;
  lic text := coalesce(c #>> '{license,kind}', 'unknown');
begin
  if pkg.origin_kind = 'owned_book' then
    raise exception 'Conversions of a book you own stay private to your family' using errcode = '42501';
  end if;
  if pkg.origin_kind = 'open_web' then
    if lic not in ('cc0', 'public_domain', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa') then
      raise exception 'The source''s license doesn''t allow sharing an adapted version' using errcode = '42501';
    end if;
    if not coalesce((c ->> 'licenseConfirmed')::boolean, false) then
      raise exception 'Confirm the source''s license before sharing it' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(c -> 'units', '[]'::jsonb)) u, jsonb_array_elements(u -> 'lessons') le) < 1 then
    raise exception 'Add at least one lesson' using errcode = '22023';
  end if;
  if coalesce(btrim(c ->> 'title'), '') = '' then
    raise exception 'Give the curriculum a title first' using errcode = '22023';
  end if;
  return jsonb_build_object('units', c -> 'units', 'license', c -> 'license', 'attribution', c -> 'attribution');
end;
$$;
revoke all on function public.coop_release_from(public.packages) from public, anon, authenticated;

create or replace function public.coop_create_class(pkg_id text, max_fam integer default 30)
returns public.coop_classes
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pkg public.packages;
  prof public.creator_profiles;
  rel jsonb;
  c jsonb;
  k text;
  cls public.coop_classes;
begin
  select * into pkg from public.packages where id = pkg_id and owner = uid;
  if uid is null or not found then
    raise exception 'Curriculum not found' using errcode = 'P0002';
  end if;
  select * into prof from public.creator_profiles where user_id = uid;
  if not found then
    raise exception 'Set up your creator profile first' using errcode = '22023';
  end if;
  if (select count(*) from public.coop_classes where teacher_user = uid) >= 50 then
    raise exception 'You can run up to 50 classes' using errcode = '54000';
  end if;
  if max_fam is null or max_fam < 1 or max_fam > 30 then
    raise exception 'A class has room for 1 to 30 families' using errcode = '22023';
  end if;
  rel := public.coop_release_from(pkg);
  c := pkg.content;
  loop
    k := public.random_invite_code(8);
    exit when not exists (select 1 from public.coop_classes where code = k);
  end loop;
  insert into public.coop_classes (teacher_user, teacher_name, package_id, code, title, description, subjects, grade_min, grade_max, lessons_per_week, minutes_per_lesson,
                                   parent_involvement, family_style, cover, color, max_families, version)
  values (uid, prof.name, pkg.id, k, left(c ->> 'title', 160), left(coalesce(c ->> 'description', ''), 2000),
          coalesce((select array_agg(x) from jsonb_array_elements_text(c -> 'subjects') x), '{}'),
          coalesce((c ->> 'gradeMin')::smallint, 1), coalesce((c ->> 'gradeMax')::smallint, 3),
          coalesce((c ->> 'lessonsPerWeek')::smallint, 3), coalesce((c ->> 'minutesPerLesson')::smallint, 30),
          coalesce(c ->> 'parentInvolvement', 'medium'), coalesce((c ->> 'familyStyle')::boolean, false),
          coalesce(c ->> 'cover', '📘'), coalesce(c ->> 'color', '#2F6B5E'), max_fam, 1)
  returning * into cls;
  insert into public.coop_class_releases (class_id, version, content) values (cls.id, 1, rel || jsonb_build_object('version', 1));
  return cls;
end;
$$;

-- Send the teacher's latest lessons to the class as a new version.
create or replace function public.coop_update_class(cid text, release_note text default null)
returns public.coop_classes
language plpgsql security definer set search_path = ''
as $$
declare
  cls public.coop_classes;
  pkg public.packages;
  rel jsonb;
  c jsonb;
begin
  select * into cls from public.coop_classes where id = cid and teacher_user = auth.uid() for update;
  if not found then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  select * into pkg from public.packages where id = cls.package_id and owner = auth.uid();
  if not found then
    raise exception 'The class’s curriculum isn’t in your Studio any more' using errcode = 'P0002';
  end if;
  rel := public.coop_release_from(pkg);
  c := pkg.content;
  update public.coop_classes
     set version = version + 1, title = left(c ->> 'title', 160), description = left(coalesce(c ->> 'description', ''), 2000),
         subjects = coalesce((select array_agg(x) from jsonb_array_elements_text(c -> 'subjects') x), '{}'),
         lessons_per_week = coalesce((c ->> 'lessonsPerWeek')::smallint, lessons_per_week), minutes_per_lesson = coalesce((c ->> 'minutesPerLesson')::smallint, minutes_per_lesson),
         cover = coalesce(c ->> 'cover', cover), color = coalesce(c ->> 'color', color), updated_at = now()
   where id = cid
  returning * into cls;
  insert into public.coop_class_releases (class_id, version, content)
  values (cid, cls.version, rel || jsonb_build_object('version', cls.version, 'note', nullif(btrim(coalesce(release_note, '')), '')));
  return cls;
end;
$$;

create or replace function public.coop_class_settings(cid text, max_fam integer, is_open boolean)
returns public.coop_classes
language plpgsql security definer set search_path = ''
as $$
declare
  cls public.coop_classes;
begin
  if max_fam is null or max_fam < 1 or max_fam > 30 then
    raise exception 'A class has room for 1 to 30 families' using errcode = '22023';
  end if;
  update public.coop_classes set max_families = max_fam, status = case when is_open then 'open' else 'closed' end, updated_at = now()
   where id = cid and teacher_user = auth.uid()
  returning * into cls;
  if not found then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  return cls;
end;
$$;

-- A new invite code (the old one stops working).
create or replace function public.coop_new_code(cid text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  k text;
begin
  loop
    k := public.random_invite_code(8);
    exit when not exists (select 1 from public.coop_classes where code = k);
  end loop;
  update public.coop_classes set code = k, updated_at = now() where id = cid and teacher_user = auth.uid();
  if not found then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  return k;
end;
$$;

-- End the class. Families keep the plan they have; it just stops getting updates.
create or replace function public.coop_delete_class(cid text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.coop_classes where id = cid and teacher_user = auth.uid();
$$;

-- The teacher's classes, with how many families are in each.
create or replace function public.coop_teaching()
returns table (id text, code text, title text, teacher_name text, package_id text, cover text, color text, max_families smallint, status text, version integer, families bigint, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.code, c.title, c.teacher_name, c.package_id, c.cover, c.color, c.max_families, c.status, c.version,
         (select count(*) from public.coop_class_members m where m.class_id = c.id), c.created_at, c.updated_at
    from public.coop_classes c
   where c.teacher_user = auth.uid()
   order by c.created_at desc;
$$;

-- Each family's progress (lesson reached per student). Names only when the family shares them.
create or replace function public.coop_roster(cid text)
returns table (family_id uuid, family_label text, share_names boolean, progress jsonb, total_lessons integer, on_version integer, joined_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.coop_classes where id = cid and teacher_user = auth.uid()) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  return query
  select m.family_id, m.family_label, m.share_names,
         case when m.share_names then m.progress
              else coalesce((select jsonb_agg(jsonb_build_object('done', e -> 'done')) from jsonb_array_elements(m.progress) e), '[]'::jsonb) end,
         m.total_lessons, m.on_version, m.joined_at, m.updated_at
    from public.coop_class_members m
   where m.class_id = cid
   order by m.joined_at;
end;
$$;

create or replace function public.coop_remove_family(cid text, fid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.coop_classes where id = cid and teacher_user = auth.uid()) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  delete from public.coop_class_members where class_id = cid and family_id = fid;
end;
$$;

-- What an invite code opens (before joining).
create or replace function public.coop_class_preview(class_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id, 'title', c.title, 'teacher_name', c.teacher_name, 'description', c.description, 'subjects', to_jsonb(c.subjects),
           'grade_min', c.grade_min, 'grade_max', c.grade_max, 'lessons_per_week', c.lessons_per_week, 'minutes_per_lesson', c.minutes_per_lesson,
           'parent_involvement', c.parent_involvement, 'family_style', c.family_style, 'cover', c.cover, 'color', c.color,
           'status', c.status, 'version', c.version, 'max_families', c.max_families,
           'families', (select count(*) from public.coop_class_members m where m.class_id = c.id),
           'lessons', (select count(*) from public.coop_class_releases r, jsonb_array_elements(r.content -> 'units') u, jsonb_array_elements(u -> 'lessons') le
                        where r.class_id = c.id and r.version = c.version),
           'joined', exists (select 1 from public.coop_class_members m where m.class_id = c.id and m.family_id = public.my_family_id()))
    from public.coop_classes c
   where c.code = upper(btrim(class_code)) and auth.uid() is not null;
$$;

-- The latest lessons, for the teacher and families in the class.
create or replace function public.coop_class_content(cid text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  cls public.coop_classes;
begin
  select * into cls from public.coop_classes where id = cid;
  if not found or not (cls.teacher_user = auth.uid() or exists (select 1 from public.coop_class_members m where m.class_id = cid and m.family_id = public.my_family_id())) then
    raise exception 'You''re not in this class' using errcode = '42501';
  end if;
  return (select content from public.coop_class_releases where class_id = cid and version = cls.version);
end;
$$;

-- Join with an invite code. Returns the class preview (as for coop_class_preview) plus its lessons.
create or replace function public.coop_join_class(class_code text, label text, share boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  cls public.coop_classes;
begin
  if fid is null then
    raise exception 'Create or join a family first' using errcode = '42501';
  end if;
  select * into cls from public.coop_classes where code = upper(btrim(coalesce(class_code, ''))) for update;
  if not found then
    raise exception 'That class code isn''t valid' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.coop_class_members where class_id = cls.id and family_id = fid) then
    if cls.status <> 'open' then
      raise exception 'This class isn''t taking new families' using errcode = '42501';
    end if;
    if (select count(*) from public.coop_class_members where class_id = cls.id) >= cls.max_families then
      raise exception 'This class is full' using errcode = '54000';
    end if;
    if (select count(*) from public.coop_class_members where family_id = fid) >= 30 then
      raise exception 'You''re in a lot of classes already. Leave one first.' using errcode = '54000';
    end if;
    insert into public.coop_class_members (class_id, family_id, family_label, share_names)
    values (cls.id, fid, left(coalesce(nullif(btrim(label), ''), public.family_display_name(fid)), 60), coalesce(share, false));
  end if;
  return public.coop_class_preview(cls.code) || jsonb_build_object('content', public.coop_class_content(cls.id));
end;
$$;

-- The classes this family is in (where plan updates come from).
create or replace function public.coop_my_classes()
returns table (class_id text, title text, teacher_name text, version integer, share_names boolean, status text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.title, c.teacher_name, c.version, m.share_names, c.status
    from public.coop_class_members m
    join public.coop_classes c on c.id = m.class_id
   where m.family_id = public.my_family_id();
$$;

-- How far this family's students have got (no names unless shared).
create or replace function public.coop_report_progress(cid text, students jsonb, total integer default null, on_ver integer default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  m public.coop_class_members;
  clean jsonb;
begin
  select * into m from public.coop_class_members where class_id = cid and family_id = fid;
  if not found then
    raise exception 'You''re not in this class' using errcode = '42501';
  end if;
  if jsonb_typeof(students) <> 'array' or jsonb_array_length(students) > 12 then
    raise exception 'Bad progress' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
           jsonb_build_object('done', least(greatest(coalesce((e ->> 'done')::integer, 0), 0), 2000))
           || case when m.share_names and coalesce(btrim(e ->> 'name'), '') <> '' then jsonb_build_object('name', left(btrim(e ->> 'name'), 40)) else '{}'::jsonb end
         ), '[]'::jsonb)
    into clean
    from jsonb_array_elements(students) e;
  update public.coop_class_members
     set progress = clean, total_lessons = least(greatest(total, 0), 2000), on_version = on_ver, updated_at = now()
   where class_id = cid and family_id = fid;
end;
$$;

create or replace function public.coop_share_names(cid text, share boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.coop_class_members
     set share_names = share,
         progress = case when share then progress else coalesce((select jsonb_agg(jsonb_build_object('done', e -> 'done')) from jsonb_array_elements(progress) e), '[]'::jsonb) end,
         updated_at = now()
   where class_id = cid and family_id = public.my_family_id();
end;
$$;

create or replace function public.coop_leave_class(cid text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.coop_class_members where class_id = cid and family_id = public.my_family_id();
$$;

revoke all on function
  public.coop_create_class(text, integer), public.coop_update_class(text, text), public.coop_class_settings(text, integer, boolean),
  public.coop_new_code(text), public.coop_delete_class(text), public.coop_teaching(), public.coop_roster(text),
  public.coop_remove_family(text, uuid), public.coop_class_preview(text), public.coop_class_content(text),
  public.coop_join_class(text, text, boolean), public.coop_my_classes(), public.coop_report_progress(text, jsonb, integer, integer),
  public.coop_share_names(text, boolean), public.coop_leave_class(text)
  from public, anon;
grant execute on function
  public.coop_create_class(text, integer), public.coop_update_class(text, text), public.coop_class_settings(text, integer, boolean),
  public.coop_new_code(text), public.coop_delete_class(text), public.coop_teaching(), public.coop_roster(text),
  public.coop_remove_family(text, uuid), public.coop_class_preview(text), public.coop_class_content(text),
  public.coop_join_class(text, text, boolean), public.coop_my_classes(), public.coop_report_progress(text, jsonb, integer, integer),
  public.coop_share_names(text, boolean), public.coop_leave_class(text)
  to authenticated;
