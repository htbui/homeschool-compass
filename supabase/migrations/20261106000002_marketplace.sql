-- Freerange Curriculum Marketplace: listings, reviews, helpful votes, purchases.
--
-- Anyone (even signed out) can browse active listings and read reviews.
-- Families list curricula and review what they've used; publisher listings,
-- verification, ESA-vendor status, and rating aggregates are server-managed.
-- Purchases are only created server-side (free claims via RPC, paid ones by
-- the checkout Edge Function), so a client can never mark itself as paid.

create table public.listings (
  id text primary key default gen_random_uuid()::text,
  seller_family uuid references public.families (id) on delete set null,
  seller_name text not null check (char_length(seller_name) between 1 and 80),
  seller_kind text not null default 'family' check (seller_kind in ('publisher', 'family')),
  seller_verified boolean not null default false,
  title text not null check (char_length(title) between 1 and 160),
  subjects text[] not null default '{}',
  grade_min smallint not null check (grade_min between -1 and 12),
  grade_max smallint not null check (grade_max between -1 and 12),
  philosophies text[] not null default '{}',
  format text not null check (format in ('print', 'digital', 'online', 'bundle')),
  price numeric(10, 2) not null check (price >= 0 and price <= 10000),
  condition text check (condition in ('new', 'like_new', 'good', 'fair')),
  description text not null default '' check (char_length(description) <= 4000),
  includes text[] not null default '{}',
  lessons integer not null check (lessons between 1 and 2000),
  lessons_per_week smallint not null default 3 check (lessons_per_week between 1 and 7),
  minutes_per_lesson smallint not null default 30 check (minutes_per_lesson between 1 and 480),
  parent_involvement text not null default 'medium' check (parent_involvement in ('high', 'medium', 'low')),
  family_style boolean not null default false,
  lesson_steps text[] not null default '{}',
  cover text not null default '📘',
  color text not null default '#2F6B5E',
  esa_eligible boolean not null default false,
  rating_avg numeric(2, 1) not null default 0,
  rating_count integer not null default 0,
  sample boolean not null default false,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (grade_min <= grade_max)
);
create index listings_active_idx on public.listings (status, created_at desc);
create index listings_seller_idx on public.listings (seller_family);

alter table public.listings enable row level security;
create policy "anyone browses active listings" on public.listings
  for select to anon, authenticated using (status = 'active' or public.is_family_member(seller_family));
create policy "families list curricula" on public.listings
  for insert to authenticated with check (public.is_family_member(seller_family) and seller_kind = 'family');
create policy "families edit their listings" on public.listings
  for update to authenticated using (public.is_family_member(seller_family)) with check (public.is_family_member(seller_family) and seller_kind = 'family');
grant select on public.listings to anon, authenticated;
grant insert, update on public.listings to authenticated;

-- Server-managed fields can't be set by end users (service role / seed have no auth.uid()).
create or replace function public.listings_protect()
returns trigger
language plpgsql
as $$
begin
  -- Depth > 1 means our own aggregate triggers are updating the row.
  if auth.uid() is not null and pg_trigger_depth() = 1 then
    if tg_op = 'INSERT' then
      new.seller_verified := false;
      new.esa_eligible := false;
      new.rating_avg := 0;
      new.rating_count := 0;
      new.sample := false;
      new.created_at := now();
    else
      new.seller_verified := old.seller_verified;
      new.esa_eligible := old.esa_eligible;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.sample := old.sample;
      new.seller_family := old.seller_family;
      new.created_at := old.created_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger listings_protect before insert or update on public.listings
  for each row execute function public.listings_protect();

-- ───────────────────────────── Purchases

create table public.purchases (
  id text primary key default gen_random_uuid()::text,
  family_id uuid not null references public.families (id) on delete cascade,
  listing_id text references public.listings (id) on delete set null,
  title text not null,
  seller text not null,
  price numeric(10, 2) not null,
  funding_source text not null default 'out_of_pocket' check (funding_source in ('esa', 'tax', 'out_of_pocket')),
  status text not null check (status in ('pending', 'paid', 'free', 'cancelled')),
  demo boolean not null default false,
  esa_eligible boolean not null default false,
  provider_session text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index purchases_family_idx on public.purchases (family_id, created_at desc);
create unique index purchases_provider_session_idx on public.purchases (provider_session) where provider_session is not null;

alter table public.purchases enable row level security;
create policy "families see their purchases" on public.purchases
  for select to authenticated using (public.is_family_member(family_id));
grant select on public.purchases to authenticated;

create or replace function public.owns_listing(fid uuid, lid text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.purchases p where p.family_id = fid and p.listing_id = lid and p.status in ('paid', 'free'));
$$;

-- Claim a free listing (no payment involved).
create or replace function public.claim_free_listing(lid text)
returns public.purchases
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid := public.my_family_id();
  l public.listings;
  p public.purchases;
begin
  if fid is null then
    raise exception 'Create or join a family first' using errcode = '42501';
  end if;
  select * into l from public.listings where id = lid and status = 'active';
  if not found then
    raise exception 'That listing is no longer available' using errcode = 'P0002';
  end if;
  if l.price > 0 then
    raise exception 'This listing is not free' using errcode = '22023';
  end if;
  select * into p from public.purchases where family_id = fid and listing_id = lid and status = 'free';
  if found then
    return p;
  end if;
  insert into public.purchases (family_id, listing_id, title, seller, price, status, esa_eligible, paid_at)
  values (fid, lid, l.title, l.seller_name, 0, 'free', l.esa_eligible, now())
  returning * into p;
  return p;
end;
$$;
revoke all on function public.claim_free_listing(text) from public, anon;
grant execute on function public.claim_free_listing(text) to authenticated;

-- ───────────────────────────── Reviews

create table public.reviews (
  id text primary key default gen_random_uuid()::text,
  listing_id text not null references public.listings (id) on delete cascade,
  family_id uuid references public.families (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  title text not null default '' check (char_length(title) <= 120),
  body text not null check (char_length(body) between 10 and 4000),
  child_grade text,
  verified boolean not null default false,
  helpful integer not null default 0,
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, family_id)
);
create index reviews_listing_idx on public.reviews (listing_id);

alter table public.reviews enable row level security;
create policy "anyone reads reviews" on public.reviews
  for select to anon, authenticated using (true);
create policy "families write their review" on public.reviews
  for insert to authenticated with check (public.is_family_member(family_id));
create policy "families edit their review" on public.reviews
  for update to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "families delete their review" on public.reviews
  for delete to authenticated using (public.is_family_member(family_id));
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

create or replace function public.reviews_protect()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1 then
    -- "Verified purchase" is derived, never claimed.
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
    if exists (select 1 from public.listings l where l.id = new.listing_id and public.is_family_member(l.seller_family)) then
      raise exception 'You can''t review your own listing' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger reviews_protect before insert or update on public.reviews
  for each row execute function public.reviews_protect();

create or replace function public.refresh_listing_rating()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  lid text := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings l
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.listing_id = lid), 0),
         rating_count = (select count(*) from public.reviews r where r.listing_id = lid)
   where l.id = lid;
  return null;
end;
$$;
create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_listing_rating();

-- ───────────────────────────── Helpful votes

create table public.review_votes (
  review_id text not null references public.reviews (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

alter table public.review_votes enable row level security;
create policy "people see their votes" on public.review_votes
  for select to authenticated using (user_id = auth.uid());
create policy "people vote" on public.review_votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "people unvote" on public.review_votes
  for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.review_votes to authenticated;

create or replace function public.refresh_review_helpful()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rid text := coalesce(new.review_id, old.review_id);
begin
  update public.reviews set helpful = (select count(*) from public.review_votes v where v.review_id = rid) where id = rid;
  return null;
end;
$$;
create trigger review_votes_refresh after insert or delete on public.review_votes
  for each row execute function public.refresh_review_helpful();
