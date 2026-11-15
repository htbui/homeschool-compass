-- Marketplace fixes found by the marketplace test suite (supabase/tests/market.test.ts).
--
-- 1. A coupon's last use could be taken twice: checkout priced the order
--    (which checks max_uses) and then counted the use in a separate step, so
--    two checkouts at the same moment both passed the check. The use is now
--    taken atomically, and the order is refused when none are left.
-- 2. Reviewers could vote their own review "helpful", and anyone could vote
--    for a review moderators had hidden. Votes now need a visible review
--    written by another family.

-- ───────────────────────────── 1. Coupon uses

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
    -- Take a use only if one is left (the row lock makes overlapping checkouts wait their turn).
    update public.coupons set uses = uses + 1
     where id = q ->> 'coupon_id' and (max_uses is null or uses < max_uses);
    if not found then
      raise exception 'That coupon code has been used up' using errcode = '22023';
    end if;
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

-- ───────────────────────────── 2. Helpful votes

-- A review this person may vote for: visible, and not written by their own family.
create or replace function public.can_vote_review(rid text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reviews r
     where r.id = rid and not r.hidden and not public.is_family_member(r.family_id)
  );
$$;
revoke all on function public.can_vote_review(text) from public, anon;
grant execute on function public.can_vote_review(text) to authenticated;

drop policy "people vote" on public.review_votes;
create policy "people vote" on public.review_votes
  for insert to authenticated with check (user_id = auth.uid() and public.can_vote_review(review_id));
