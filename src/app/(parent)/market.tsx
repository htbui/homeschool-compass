import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { BundleCard } from '@/components/market/BundleCard';
import { GiftsPanel } from '@/components/market/GiftsPanel';
import { ListingCard, money } from '@/components/market/ListingCard';
import { ReviewSheet } from '@/components/market/ReviewSheet';
import { SellSheet } from '@/components/market/SellSheet';
import { followedCreators } from '@/lib/creators';
import { formatDate } from '@/lib/dates';
import {
  FORMAT_LABEL,
  gradeNumber,
  matchListing,
  PHILOSOPHY_SHORT,
  PRICE_LABEL,
  SORT_LABEL,
  filterListings,
  sortListings,
  type Listing,
  type ListingFilters,
  type ListingFormat,
  type PriceBand,
  type Purchase,
  type SortKey,
} from '@/lib/market';
import { emptyState, filterCounts, fromFollowed, groupLibrary, hasRatings, sortOptions, topBundles } from '@/lib/marketView';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import type { Philosophy, Subject } from '@/lib/types';
import { useBundles, useCatalog } from '@/store/useMarket';
import { cloudEnabled } from '@/services/cloud';
import { enterStudio } from '@/services/studioMode';
import { useStore } from '@/store/useStore';
import { deleteListing, refreshPurchases } from '@/services/marketApi';
import { Actions, Button, Card, Chip, ConfirmButton, Empty, Field, fonts, Pill, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors } from '@/ui';

type View_ = 'browse' | 'library' | 'selling';
type GradeMode = 'mine' | 'all';

/** One short line under the title, by view and by what the catalog holds. */
const TAGLINE: Record<View_, Record<'sample' | 'cloud', string>> = {
  browse: { sample: 'Free & open classics, organized into lesson plans.', cloud: 'Curricula from publishers, creators, and other families.' },
  library: { sample: 'Everything you’ve bought, claimed, or been given.', cloud: 'Everything you’ve bought, claimed, or been given.' },
  selling: { sample: 'Sell or give away curricula you’re done with.', cloud: 'Sell or give away curricula you’re done with.' },
};

export default function Marketplace() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ used?: string; view?: string; q?: string; style?: string; checkout?: string }>();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const purchases = useStore((s) => s.purchases);
  const following = useStore((s) => s.followedCreators);
  const noticeHidden = useStore((s) => !!s.marketNoticeHiddenAt);
  // Studio creations are managed in Studio; this tab is for used books and simple listings.
  const allMine = useStore((s) => s.myListings);
  const myListings = useMemo(() => allMine.filter((l) => !l.packageId), [allMine]);
  const { listings, source } = useCatalog();
  const bundles = useBundles();

  const [view, setView] = useState<View_>(params.view === 'selling' ? 'selling' : params.view === 'library' ? 'library' : 'browse');
  const [query, setQuery] = useState(params.q ?? '');
  const [sort, setSort] = useState<SortKey>('match');
  const [gradeMode, setGradeMode] = useState<GradeMode>(params.used ? 'all' : 'mine');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [price, setPrice] = useState<PriceBand>('any');
  const [formats, setFormats] = useState<ListingFormat[]>([]);
  const [philosophies, setPhilosophies] = useState<Philosophy[]>(params.style ? [params.style as Philosophy] : []);
  const [esaOnly, setEsaOnly] = useState(false);
  const [used, setUsed] = useState<'any' | 'new' | 'used'>(params.used ? 'used' : 'any');
  const [minRating, setMinRating] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [allBundles, setAllBundles] = useState(false);
  const [selling, setSelling] = useState<Listing | 'new' | null>(null);

  // Deep links (e.g. from Community or Curriculum) can change the view after mount.
  const paramKey = JSON.stringify(params);
  const [seenParams, setSeenParams] = useState(paramKey);
  if (paramKey !== seenParams) {
    setSeenParams(paramKey);
    if (params.view === 'selling' || params.view === 'library') setView(params.view);
    // Back from hosted checkout: pick up the new purchase.
    if (params.checkout === 'success') refreshPurchases();
    if (params.used) {
      setView('browse');
      setUsed('used');
      setGradeMode('all');
    }
    if (params.q !== undefined) {
      setView('browse');
      setQuery(params.q);
    }
    if (params.style) {
      setView('browse');
      setPhilosophies([params.style as Philosophy]);
    }
  }

  const ctx = useMemo(() => ({ family, kids }), [family, kids]);
  const kidGrades = useMemo(() => [...new Set(kids.map((k) => gradeNumber(k.grade)).filter((g): g is number => g !== undefined))], [kids]);
  const filters: ListingFilters = { query, subjects, grades: gradeMode === 'mine' ? kidGrades : undefined, price, formats, philosophies, esaOnly, used, minRating };
  // The React Compiler memoizes this; the catalog is small enough to filter on every render.
  const results = sortListings(filterListings(listings, filters), sort, ctx);
  const owned = new Set(purchases.map((p) => p.listingId));
  const sorts = sortOptions(listings);
  // Bundles with something in the current results: two at most, the rest a tap away.
  const shownIds = new Set(results.map((l) => l.id));
  const bundlePick = topBundles(bundles, shownIds, allBundles ? Infinity : 2);
  const followed = fromFollowed(listings, following ?? []);
  const extraFilters = [price !== 'any', formats.length > 0, philosophies.length > 0, esaOnly, used !== 'any', minRating > 0].filter(Boolean).length;
  const cols = width >= 1400 ? 3 : width >= 760 ? 2 : 1;
  const narrow = width < 760;
  const colWidth = cols === 1 ? '100%' : (`${100 / cols - 2}%` as const);

  const clearFilters = () => {
    setSubjects([]);
    setPrice('any');
    setFormats([]);
    setPhilosophies([]);
    setEsaOnly(false);
    setUsed('any');
    setMinRating(0);
  };
  const clearAll = () => {
    setQuery('');
    clearFilters();
    setGradeMode('all');
  };
  const empty = results.length === 0 ? emptyState(listings, filters, { mineGrades: gradeMode === 'mine' }) : undefined;

  return (
    <Screen>
      <T v="display">{view === 'library' ? 'My library' : 'Marketplace'}</T>
      <T muted>{TAGLINE[view][source]}</T>
      {source === 'sample' && view === 'browse' && !noticeHidden ? (
        <Row gap={space.sm} style={{ marginTop: space.sm, backgroundColor: c.accentSoft, borderRadius: 12, paddingLeft: space.md }}>
          <T v="caption" color={c.accentInk} style={{ flex: 1, paddingVertical: space.sm }}>
            📚 Showing free & open curricula · {cloudEnabled ? 'Sign in for publishers, creators, and used books' : 'Publishers and used books are in the connected app'}
          </T>
          <Pressable onPress={() => useStore.getState().hideMarketNotice()} accessibilityRole="button" accessibilityLabel="Hide this note" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.accentInk, fontSize: 16, fontFamily: fonts.body }}>✕</Text>
          </Pressable>
        </Row>
      ) : null}
      <View style={{ marginTop: space.md }}>
        <Segmented<View_>
          value={view}
          onChange={setView}
          options={[
            { value: 'browse', label: '🛍️ Browse' },
            { value: 'library', label: `📚 My library${purchases.length ? ` (${purchases.length})` : ''}` },
            { value: 'selling', label: `🏷️ Selling${myListings.length ? ` (${myListings.length})` : ''}` },
          ]}
        />
      </View>

      {view === 'browse' ? (
        <>
          <Stack gap={space.sm} style={{ marginTop: space.md }}>
            <Field placeholder="Search curricula, publishers, subjects…" value={query} onChangeText={setQuery} accessibilityLabel="Search the marketplace" />
            <Row wrap gap={6}>
              <Chip role="radio" label={`👧 My kids' grades${kidGrades.length ? '' : ' (add kids first)'}`} selected={gradeMode === 'mine'} onPress={() => setGradeMode('mine')} />
              <Chip role="radio" label="All grades" selected={gradeMode === 'all'} onPress={() => setGradeMode('all')} />
              <Chip label={`⚙️ Filters${extraFilters ? ` (${extraFilters})` : ''}`} onPress={() => setFiltersOpen(true)} />
              <Chip label={`Sort: ${SORT_LABEL[sort]} ▾`} onPress={() => setSortOpen(true)} />
            </Row>
            {/* The one row that scrolls sideways on phones. */}
            <ChipRow narrow={narrow}>
              <Chip label="All subjects" selected={subjects.length === 0} onPress={() => setSubjects([])} />
              {SUBJECT_LIST.filter((s) => listings.some((l) => l.subjects.includes(s))).map((s) => (
                <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subjects.includes(s)} onPress={() => setSubjects(subjects.includes(s) ? subjects.filter((x) => x !== s) : [...subjects, s])} />
              ))}
            </ChipRow>
          </Stack>

          {followed.length ? (
            <Section title="🏪 From creators you follow">
              <CardRow narrow={narrow} cols={cols}>
                {followed.map((l) => (
                  <ListingCard key={l.id} listing={l} owned={owned.has(l.id)} />
                ))}
              </CardRow>
            </Section>
          ) : null}

          {bundlePick.shown.length ? (
            <Section
              title="🎁 Bundles"
              subtitle="Curricula from one creator, together for less."
              action={bundlePick.total > 2 ? <Button size="sm" kind="ghost" title={allBundles ? 'Show fewer' : `See all ${bundlePick.total}`} onPress={() => setAllBundles(!allBundles)} /> : undefined}>
              <CardRow narrow={narrow && !allBundles} cols={cols}>
                {bundlePick.shown.map((b) => (
                  <BundleCard key={b.id} bundle={b} listings={listings} owned={owned} />
                ))}
              </CardRow>
            </Section>
          ) : null}

          <Section title={`${results.length} ${results.length === 1 ? 'curriculum' : 'curricula'}`} subtitle={sort === 'match' && results.length ? `Ranked for your family: ${family.philosophy ? 'teaching style, ' : ''}kids' grades${hasRatings(listings) ? ', and ratings' : ''}.` : undefined}>
            {empty ? (
              <Empty
                icon="🔎"
                title={empty.title}
                body={empty.body}
                action={
                  <Stack gap={space.sm} style={{ alignItems: 'center' }}>
                    <Row wrap style={{ justifyContent: 'center' }}>
                      {empty.actions.includes('clear_search') ? <Button kind="secondary" title="Clear search" onPress={() => setQuery('')} /> : null}
                      {empty.actions.includes('all_grades') ? <Button kind="secondary" title={query.trim() ? 'Search all grades' : 'Show all grades'} onPress={() => setGradeMode('all')} /> : null}
                      {empty.actions.includes('clear_filters') ? <Button kind="secondary" title="Clear filters" onPress={clearFilters} /> : null}
                    </Row>
                    {empty.subjects.length && !query.trim() ? (
                      <Row wrap gap={6} style={{ justifyContent: 'center' }}>
                        <T v="caption" muted>Try:</T>
                        {empty.subjects.map((x) => (
                          <Chip key={x.subject} label={`${SUBJECTS[x.subject].icon} ${SUBJECTS[x.subject].label} (${x.count})`} onPress={() => { clearFilters(); setSubjects([x.subject]); }} />
                        ))}
                      </Row>
                    ) : null}
                  </Stack>
                }
              />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                {results.map((l) => (
                  <View key={l.id} style={{ width: colWidth, flexGrow: 1 }}>
                    <ListingCard listing={l} owned={owned.has(l.id)} reasons={sort === 'match' ? matchListing(l, ctx).reasons.slice(0, 2) : undefined} />
                  </View>
                ))}
              </View>
            )}
          </Section>
        </>
      ) : null}

      {view === 'library' ? (
        <>
          <Library purchases={purchases} listings={listings} onBrowse={() => setView('browse')} />
          <Following listings={listings} />
        </>
      ) : null}

      {view === 'selling' ? (
        <>
          <Card onPress={enterStudio} style={{ marginTop: space.lg }}>
            <T v="heading">🎨 Made your own curriculum?</T>
            <T v="caption" muted>Build it lesson by lesson in Freerange Studio — or adapt a free online course — and families can schedule every lesson in one tap.</T>
          </Card>
          <Section title="Your listings" subtitle="Used books and simple listings." action={<Button size="sm" icon="＋" title="List a curriculum" onPress={() => setSelling('new')} />}>
            {myListings.length === 0 ? (
              <Empty icon="🏷️" title="Nothing listed yet" body="Finished a level? List it so another family can use it — free or for a few dollars." action={<Button title="List a curriculum" onPress={() => setSelling('new')} />} />
            ) : (
              <Stack>
                {myListings.map((l) => (
                  <MyListingRow key={l.id} listing={l} onEdit={() => setSelling(l)} />
                ))}
              </Stack>
            )}
          </Section>
        </>
      ) : null}

      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        listings={listings}
        filters={filters}
        results={results.length}
        set={{ setPrice, setUsed, setFormats, setPhilosophies, setEsaOnly, setMinRating }}
        onClear={clearAll}
      />
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <View role="radiogroup" aria-label="Sort by" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {sorts.map((k) => (
            <Chip
              key={k}
              role="radio"
              label={SORT_LABEL[k]}
              selected={sort === k}
              onPress={() => {
                setSort(k);
                setSortOpen(false);
              }}
            />
          ))}
        </View>
        {!hasRatings(listings) ? <T v="caption" muted>Rating sorts appear once families have reviewed some curricula.</T> : null}
      </Sheet>
      <SellSheet existing={selling === 'new' ? undefined : (selling ?? undefined)} visible={selling !== null} onClose={() => setSelling(null)} />
    </Screen>
  );
}

/** Wrapping chips on wide screens; one sideways-scrolling line on phones. */
function ChipRow({ narrow, children }: { narrow: boolean; children: React.ReactNode }) {
  if (!narrow) return <Row wrap gap={6} align="center">{children}</Row>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: -6 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingVertical: 6 }}>
      {children}
    </ScrollView>
  );
}

/** A grid of cards; on phones, one sideways-scrolling row so it doesn't push the results down. */
function CardRow({ narrow, cols, children }: { narrow: boolean; cols: number; children: React.ReactNode[] }) {
  if (narrow) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
        {children.map((child, i) => (
          <View key={i} style={{ width: 300 }}>
            {child}
          </View>
        ))}
      </ScrollView>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {children.map((child, i) => (
        <View key={i} style={{ width: cols === 1 ? '100%' : `${100 / cols - 2}%`, flexGrow: 1 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

type FilterSetters = {
  setPrice: (p: PriceBand) => void;
  setUsed: (u: 'any' | 'new' | 'used') => void;
  setFormats: (f: ListingFormat[]) => void;
  setPhilosophies: (p: Philosophy[]) => void;
  setEsaOnly: (b: boolean) => void;
  setMinRating: (n: number) => void;
};

/** Filters, each option with how many curricula it shows; dead ends are dimmed, and "Show N" is always on screen. */
function FiltersSheet({ visible, onClose, listings, filters: f, results, set, onClear }: { visible: boolean; onClose: () => void; listings: Listing[]; filters: ListingFilters; results: number; set: FilterSetters; onClear: () => void }) {
  const n = visible ? filterCounts(listings, f) : undefined;
  if (!n) return null;
  const formats = f.formats ?? [];
  const philosophies = f.philosophies ?? [];
  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={
        <Row gap={space.sm}>
          <Button kind="secondary" title="Clear all" onPress={onClear} />
          <Button title={`Show ${results} ${results === 1 ? 'curriculum' : 'curricula'}`} onPress={onClose} style={{ flex: 1 }} />
        </Row>
      }>
      <FilterGroup label="Price" radio>
        {(Object.keys(PRICE_LABEL) as PriceBand[]).map((p) => (
          <Option key={p} role="radio" label={PRICE_LABEL[p]} count={n.price[p]} selected={(f.price ?? 'any') === p} onPress={() => set.setPrice(p)} />
        ))}
      </FilterGroup>
      <FilterGroup label="New or used" radio>
        <Option role="radio" label="Any" count={n.used.any} selected={f.used === 'any'} onPress={() => set.setUsed('any')} />
        <Option role="radio" label="From publishers" count={n.used.new} selected={f.used === 'new'} onPress={() => set.setUsed('new')} />
        <Option role="radio" label="Used, from families" count={n.used.used} selected={f.used === 'used'} onPress={() => set.setUsed('used')} />
      </FilterGroup>
      <FilterGroup label="Format">
        {(Object.keys(FORMAT_LABEL) as ListingFormat[]).map((x) => (
          <Option key={x} label={x === 'online' ? '💻 Online (course or text)' : FORMAT_LABEL[x]} count={n.formats[x]} selected={formats.includes(x)} onPress={() => set.setFormats(toggle(formats, x))} />
        ))}
      </FilterGroup>
      <FilterGroup label="Teaching style">
        {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
          <Option key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_SHORT[p]}`} count={n.philosophies[p]} selected={philosophies.includes(p)} onPress={() => set.setPhilosophies(toggle(philosophies, p))} />
        ))}
      </FilterGroup>
      {hasRatings(listings) ? (
        <FilterGroup label="Rating" radio>
          {[0, 3, 4, 4.5].map((r) => (
            <Option key={r} role="radio" label={r ? `${r}★ & up` : 'Any'} count={n.rating[r]} selected={(f.minRating ?? 0) === r} onPress={() => set.setMinRating(r)} />
          ))}
        </FilterGroup>
      ) : null}
      <FilterGroup label="Funding">
        <Option label="🏛️ ESA-approved vendors only" count={n.esa} selected={!!f.esaOnly} onPress={() => set.setEsaOnly(!f.esaOnly)} />
      </FilterGroup>
    </Sheet>
  );
}

/** A filter chip with its count; an option that would show nothing is dimmed (still tappable to turn it off). */
function Option({ label, count, selected, onPress, role }: { label: string; count: number; selected: boolean; onPress: () => void; role?: 'radio' }) {
  return (
    <View style={{ opacity: count === 0 && !selected ? 0.5 : 1 }}>
      <Chip role={role} label={`${label} (${count})`} selected={selected} onPress={onPress} />
    </View>
  );
}

function FilterGroup({ label, children, radio }: { label: string; children: React.ReactNode; radio?: boolean }) {
  return (
    <Stack gap={6}>
      <T v="label">{label}</T>
      <View role={radio ? 'radiogroup' : 'group'} aria-label={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {children}
      </View>
    </Stack>
  );
}

/** Storefronts this family follows. */
function Following({ listings }: { listings: Listing[] }) {
  const following = useStore((s) => s.followedCreators);
  const creators = followedCreators(listings, following ?? []);
  if (!creators.length) return null;
  return (
    <Section title="Creators you follow" subtitle="Their newest curricula also show at the top of Browse.">
      <Row wrap gap={space.sm}>
        {creators.map((cr) => (
          <Chip key={cr.id} label={`🏪 ${cr.name}${cr.verified ? ' ✓' : ''} · ${cr.listings}`} onPress={() => router.push({ pathname: '/creator/[id]', params: { id: cr.id } })} />
        ))}
      </Row>
    </Section>
  );
}

/** My library, grouped: not started yet (with Add to plan), in your plan, and gifts. */
function Library({ purchases, listings, onBrowse }: { purchases: Purchase[]; listings: Listing[]; onBrowse: () => void }) {
  const curricula = useStore((s) => s.curricula);
  const [planFor, setPlanFor] = useState<{ listing: Listing; purchase: Purchase } | null>(null);
  const [reviewFor, setReviewFor] = useState<Listing | null>(null);
  const myReviews = useStore((s) => s.myReviews);

  const groups = groupLibrary(purchases, curricula);
  const row = (p: Purchase) => <LibraryRow key={p.id} purchase={p} listing={listings.find((l) => l.id === p.listingId)} onPlan={setPlanFor} onReview={setReviewFor} />;
  // GiftsPanel keeps one place in the tree, so claiming a first gift doesn't reset its message.
  return (
    <>
      {purchases.length === 0 ? (
        <Section title="Nothing here yet">
          <Empty icon="📚" title="No curricula yet" body="Anything you buy, get free, or are given shows up here, ready to add to your plan." action={<Button title="Browse the marketplace" onPress={onBrowse} />} />
        </Section>
      ) : (
        <View>
          {groups.notStarted.length ? (
            <Section title={`Not started (${groups.notStarted.length})`} subtitle="Add any of these to your plan with a pace that fits your year.">
              <Stack>{groups.notStarted.map(row)}</Stack>
            </Section>
          ) : null}
          {groups.gifts.length ? (
            <Section title={`🎁 Gifts (${groups.gifts.length})`} subtitle="Curricula other families gave you.">
              <Stack>{groups.gifts.map(row)}</Stack>
            </Section>
          ) : null}
          {groups.inPlan.length ? (
            <Section title={`In your plan (${groups.inPlan.length})`}>
              <Stack>{groups.inPlan.map(row)}</Stack>
            </Section>
          ) : null}
        </View>
      )}
      {planFor ? <AddToPlanSheet listing={planFor.listing} purchaseId={planFor.purchase.id} visible onClose={() => setPlanFor(null)} /> : null}
      {reviewFor ? <ReviewSheet listing={reviewFor} existing={myReviews.find((r) => r.listingId === reviewFor.id)} visible onClose={() => setReviewFor(null)} /> : null}
      <GiftsPanel />
    </>
  );
}

function LibraryRow({ purchase: p, listing, onPlan, onReview }: { purchase: Purchase; listing?: Listing; onPlan: (x: { listing: Listing; purchase: Purchase }) => void; onReview: (l: Listing) => void }) {
  const inPlan = useStore((s) => !!p.curriculumId && s.curricula.some((k) => k.id === p.curriculumId));
  const review = useStore((s) => s.myReviews.find((r) => r.listingId === p.listingId));
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <T v="heading" style={{ flex: 1 }}>{listing?.cover ?? '📘'} {p.title}</T>
        <Pill text={p.giftFrom ? `🎁 Gift from ${p.giftFrom}` : p.status === 'free' ? 'Free' : `${money(p.price)}${p.demo ? ' · demo' : ''}`} tone={p.giftFrom ? 'success' : undefined} />
      </Row>
      <T v="caption" muted>
        {p.seller} · {formatDate(p.purchasedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}
        {p.price > 0 ? ` · ${p.fundingSource === 'esa' ? 'ESA / state funds' : p.fundingSource === 'tax' ? 'tax records' : 'family budget'} · in your expenses` : ''}
        {p.bundleId ? ' · part of a bundle' : ''}
        {p.listPrice && p.listPrice > p.price ? ` · saved ${money(Math.round((p.listPrice - p.price) * 100) / 100)}` : ''}
      </T>
      <Row wrap>
        {inPlan ? <Pill text="✓ In your plan" tone="success" /> : listing ? <Button size="sm" title="Add to plan" onPress={() => onPlan({ listing, purchase: p })} /> : null}
        {listing ? <Button size="sm" kind="secondary" title={review ? `Edit review (${review.rating}★)` : 'Write a review'} onPress={() => onReview(listing)} /> : null}
        {listing ? <Button size="sm" kind="ghost" title="View listing" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })} /> : null}
      </Row>
    </Card>
  );
}

function MyListingRow({ listing: l, onEdit }: { listing: Listing; onEdit: () => void }) {
  return (
    <View>
      <ListingCard listing={l} />
      <Actions style={{ marginTop: 6 }}>
        <Button size="sm" kind="secondary" title="Edit" onPress={onEdit} />
        <ConfirmButton title="Remove" question={`Remove “${l.title}”?`} body="Families will no longer see it. Purchases already made are kept." confirm="Remove" onConfirm={() => deleteListing(l.id)} />
      </Actions>
    </View>
  );
}
