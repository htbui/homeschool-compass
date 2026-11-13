-- Free & open curricula (public domain or openly licensed) that Freerange
-- converted into lesson plans, listed under their original author. Only the
-- seed (run as the database owner) adds them; families and creators can't,
-- because their insert policies require 'family' and publish_package() sets 'creator'.
alter table public.listings drop constraint listings_seller_kind_check;
alter table public.listings add constraint listings_seller_kind_check check (seller_kind in ('publisher', 'creator', 'family', 'open'));
