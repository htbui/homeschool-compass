import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { ListingCard, money } from '@/components/market/ListingCard';
import { ReviewSheet } from '@/components/market/ReviewSheet';
import { SellSheet } from '@/components/market/SellSheet';
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
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import type { Philosophy, Subject } from '@/lib/types';
import { useCatalog } from '@/store/useMarket';
import { enterStudio } from '@/services/studioMode';
import { useStore } from '@/store/useStore';
import { deleteListing, refreshPurchases } from '@/services/marketApi';
import { Button, Card, Chip, Empty, Field, Pill, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

type View_ = 'browse' | 'library' | 'selling';
type GradeMode = 'mine' | 'all';

export default function Marketplace() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ used?: string; view?: string; q?: string; style?: string; checkout?: string }>();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const purchases = useStore((s) => s.purchases);
  // Studio creations are managed in Studio; this tab is for used books and simple listings.
  const allMine = useStore((s) => s.myListings);
  const myListings = useMemo(() => allMine.filter((l) => !l.packageId), [allMine]);
  const { listings, source } = useCatalog();

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
  const extraFilters = [price !== 'any', formats.length > 0, philosophies.length > 0, esaOnly, used !== 'any', minRating > 0].filter(Boolean).length;
  const cols = width >= 1200 ? 3 : width >= 760 ? 2 : 1;

  const clearAll = () => {
    setQuery('');
    setSubjects([]);
    setPrice('any');
    setFormats([]);
    setPhilosophies([]);
    setEsaOnly(false);
    setUsed('any');
    setMinRating(0);
    setGradeMode('all');
  };

  return (
    <Screen>
      <T v="display">Marketplace</T>
      <T muted>Curricula from publishers and used books from other families — compare reviews, buy, and drop it straight into your plan.</T>
      {source === 'sample' ? (
        <Card tint={c.accentSoft} style={{ marginTop: space.md }}>
          <T v="caption">🧪 Sample catalog: these publishers, listings, and reviews are demo data so you can try the marketplace. Sign in (Settings → Account) to shop the live catalog.</T>
        </Card>
      ) : null}
      <View style={{ marginTop: space.lg }}>
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
          <Stack gap={space.sm} style={{ marginTop: space.lg }}>
            <Field placeholder="Search curricula, publishers, subjects…" value={query} onChangeText={setQuery} accessibilityLabel="Search the marketplace" />
            <Row wrap gap={6}>
              <Chip label={`👧 My kids' grades${kidGrades.length ? '' : ' (add kids first)'}`} selected={gradeMode === 'mine'} onPress={() => setGradeMode('mine')} />
              <Chip label="All grades" selected={gradeMode === 'all'} onPress={() => setGradeMode('all')} />
              <Chip label={`⚙️ Filters${extraFilters ? ` (${extraFilters})` : ''}`} selected={extraFilters > 0} onPress={() => setFiltersOpen(true)} />
            </Row>
            <ChipRow narrow={width < 760}>
              <Chip label="All subjects" selected={subjects.length === 0} onPress={() => setSubjects([])} />
              {SUBJECT_LIST.filter((s) => listings.some((l) => l.subjects.includes(s))).map((s) => (
                <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subjects.includes(s)} onPress={() => setSubjects(subjects.includes(s) ? subjects.filter((x) => x !== s) : [...subjects, s])} />
              ))}
            </ChipRow>
            <ChipRow narrow={width < 760}>
              <T v="label">Sort:</T>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <Chip key={k} label={SORT_LABEL[k]} selected={sort === k} onPress={() => setSort(k)} />
              ))}
            </ChipRow>
          </Stack>

          <Section title={`${results.length} ${results.length === 1 ? 'curriculum' : 'curricula'}`} subtitle={sort === 'match' ? `Ranked for your family: ${family.philosophy ? 'teaching style, ' : ''}kids' grades, and ratings.` : undefined}>
            {results.length === 0 ? (
              <Empty icon="🔎" title="Nothing matches those filters" body="Try fewer filters or all grades." action={<Button kind="secondary" title="Clear filters" onPress={clearAll} />} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                {results.map((l) => (
                  <View key={l.id} style={{ width: cols === 1 ? '100%' : `${100 / cols - 2}%`, flexGrow: 1 }}>
                    <ListingCard listing={l} owned={owned.has(l.id)} reasons={sort === 'match' ? matchListing(l, ctx).reasons.slice(0, 2) : undefined} />
                  </View>
                ))}
              </View>
            )}
          </Section>
        </>
      ) : null}

      {view === 'library' ? <Library purchases={purchases} listings={listings} onBrowse={() => setView('browse')} /> : null}

      {view === 'selling' ? (
        <>
        <Card onPress={enterStudio} style={{ marginTop: space.lg }}>
          <T v="heading">🎨 Made your own curriculum?</T>
          <T v="caption" muted>Build it lesson by lesson in Kinship Studio — or adapt a free online course — and families can schedule every lesson in one tap.</T>
        </Card>
        <Section title="Your listings" subtitle="Sell or give away curricula you're done with." action={<Button size="sm" icon="＋" title="List a curriculum" onPress={() => setSelling('new')} />}>
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

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <FilterGroup label="Price">
          {(Object.keys(PRICE_LABEL) as PriceBand[]).map((p) => (
            <Chip key={p} label={PRICE_LABEL[p]} selected={price === p} onPress={() => setPrice(p)} />
          ))}
        </FilterGroup>
        <FilterGroup label="New or used">
          <Chip label="Any" selected={used === 'any'} onPress={() => setUsed('any')} />
          <Chip label="From publishers" selected={used === 'new'} onPress={() => setUsed('new')} />
          <Chip label="Used, from families" selected={used === 'used'} onPress={() => setUsed('used')} />
        </FilterGroup>
        <FilterGroup label="Format">
          {(Object.keys(FORMAT_LABEL) as ListingFormat[]).map((f) => (
            <Chip key={f} label={FORMAT_LABEL[f]} selected={formats.includes(f)} onPress={() => setFormats(formats.includes(f) ? formats.filter((x) => x !== f) : [...formats, f])} />
          ))}
        </FilterGroup>
        <FilterGroup label="Teaching style">
          {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
            <Chip key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_SHORT[p]}`} selected={philosophies.includes(p)} onPress={() => setPhilosophies(philosophies.includes(p) ? philosophies.filter((x) => x !== p) : [...philosophies, p])} />
          ))}
        </FilterGroup>
        <FilterGroup label="Rating">
          {[0, 3, 4, 4.5].map((r) => (
            <Chip key={r} label={r ? `${r}★ & up` : 'Any'} selected={minRating === r} onPress={() => setMinRating(r)} />
          ))}
        </FilterGroup>
        <FilterGroup label="Funding">
          <Chip label="🏛️ ESA-approved vendors only" selected={esaOnly} onPress={() => setEsaOnly(!esaOnly)} />
        </FilterGroup>
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button kind="secondary" title="Clear all" onPress={clearAll} />
          <Button title={`Show ${results.length}`} onPress={() => setFiltersOpen(false)} />
        </Row>
      </Sheet>
      <SellSheet existing={selling === 'new' ? undefined : (selling ?? undefined)} visible={selling !== null} onClose={() => setSelling(null)} />
    </Screen>
  );
}

/** Wrapping chips on wide screens; one sideways-scrolling line on phones. */
function ChipRow({ narrow, children }: { narrow: boolean; children: React.ReactNode }) {
  if (!narrow) return <Row wrap gap={6} align="center">{children}</Row>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      {children}
    </ScrollView>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={6}>
      <T v="label">{label}</T>
      <Row wrap gap={6}>{children}</Row>
    </Stack>
  );
}

function Library({ purchases, listings, onBrowse }: { purchases: Purchase[]; listings: Listing[]; onBrowse: () => void }) {
  const c = useColors();
  const curricula = useStore((s) => s.curricula);
  const myReviews = useStore((s) => s.myReviews);
  const [planFor, setPlanFor] = useState<{ listing: Listing; purchase: Purchase } | null>(null);
  const [reviewFor, setReviewFor] = useState<Listing | null>(null);

  if (purchases.length === 0) {
    return (
      <Section title="My library">
        <Empty icon="📚" title="No curricula yet" body="Anything you buy or get free shows up here, ready to add to your plan." action={<Button title="Browse the marketplace" onPress={onBrowse} />} />
      </Section>
    );
  }
  return (
    <Section title="My library" subtitle="Everything you've bought or claimed. Add any of it to your plan with a pace that fits your year.">
      <Stack>
        {purchases.map((p) => {
          const listing = listings.find((l) => l.id === p.listingId);
          const inPlan = p.curriculumId && curricula.some((k) => k.id === p.curriculumId);
          const review = myReviews.find((r) => r.listingId === p.listingId);
          return (
            <Card key={p.id}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <T v="heading" style={{ flex: 1 }}>{listing?.cover ?? '📘'} {p.title}</T>
                <Pill text={p.status === 'free' ? 'Free' : `${money(p.price)}${p.demo ? ' · demo' : ''}`} />
              </Row>
              <T v="caption" muted>
                {p.seller} · {formatDate(p.purchasedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}
                {p.price > 0 ? ` · ${p.fundingSource === 'esa' ? 'ESA' : p.fundingSource === 'tax' ? 'tax-deductible' : 'out of pocket'} · in your expenses` : ''}
              </T>
              <Row wrap>
                {inPlan ? (
                  <Pill text="✓ In your plan" bg={c.successSoft} fg={c.success} />
                ) : listing ? (
                  <Button size="sm" title="Add to plan" onPress={() => setPlanFor({ listing, purchase: p })} />
                ) : null}
                {listing ? <Button size="sm" kind="secondary" title={review ? `Edit review (${review.rating}★)` : 'Write a review'} onPress={() => setReviewFor(listing)} /> : null}
                {listing ? <Button size="sm" kind="ghost" title="View listing" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })} /> : null}
              </Row>
            </Card>
          );
        })}
      </Stack>
      {planFor ? <AddToPlanSheet listing={planFor.listing} purchaseId={planFor.purchase.id} visible onClose={() => setPlanFor(null)} /> : null}
      {reviewFor ? <ReviewSheet listing={reviewFor} existing={myReviews.find((r) => r.listingId === reviewFor.id)} visible onClose={() => setReviewFor(null)} /> : null}
    </Section>
  );
}

function MyListingRow({ listing: l, onEdit }: { listing: Listing; onEdit: () => void }) {
  const confirm = useConfirm();
  return (
    <View>
      <ListingCard listing={l} />
      <Row style={{ justifyContent: 'flex-end', marginTop: 6 }}>
        <Button size="sm" kind="secondary" title="Edit" onPress={onEdit} />
        <Button size="sm" kind="danger" title="Remove" onPress={() => confirm.ask(`Remove “${l.title}”?`, () => deleteListing(l.id), { confirm: 'Remove', body: 'Families will no longer see it. Purchases already made are kept.' })} />
      </Row>
      {confirm.element}
    </View>
  );
}
