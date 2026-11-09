import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { normalizeUrl } from '@/lib/curriculum';
import { parseOutline, parseTable, parseWebPage, type ImportResult, type WebImport } from '@/lib/importers';
import { LICENSE_INFO, licenseName, SOURCE_LICENSES, type LicenseKind } from '@/lib/license';
import { lessonTotal, newLesson, newPackage, newUnit, type CurriculumPackage, type Origin, type PackageUnit } from '@/lib/package';
import { parseCount } from '@/lib/parse';
import { fetchPage, savePackage } from '@/services/studioApi';
import { Button, Card, Chip, Field, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

type From = 'scratch' | 'web' | 'sheet' | 'book';
const TITLES: Record<From, string> = { scratch: 'Start from scratch', web: 'Adapt a free curriculum', sheet: 'Import a spreadsheet', book: 'Convert a book you own' };

/** Bring lessons in from a book, a spreadsheet, a web page, or a blank plan. */
export default function ImportScreen() {
  const { from: raw } = useLocalSearchParams<{ from?: string }>();
  const from: From = raw === 'web' || raw === 'sheet' || raw === 'book' ? raw : 'scratch';
  const create = (p: Partial<CurriculumPackage>) => {
    const pkg = newPackage(p);
    savePackage(pkg);
    router.replace({ pathname: '/studio/[id]', params: { id: pkg.id, tab: from === 'scratch' ? 'details' : 'lessons' } });
  };
  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: TITLES[from] }} />
      {from === 'scratch' ? <Scratch onCreate={create} /> : from === 'book' ? <Book onCreate={create} /> : from === 'sheet' ? <Sheet onCreate={create} /> : <Web onCreate={create} />}
    </Screen>
  );
}

type Create = (p: Partial<CurriculumPackage>) => void;

function Preview({ result }: { result: ImportResult }) {
  const c = useColors();
  const total = lessonTotal(result.units);
  if (!total && !result.warnings.length) return null;
  return (
    <Card tint={c.surfaceAlt}>
      <T v="heading">Preview: {total} lesson{total === 1 ? '' : 's'} in {result.units.length} unit{result.units.length === 1 ? '' : 's'}</T>
      {result.units.slice(0, 6).map((u) => (
        <View key={u.id} style={{ gap: 2 }}>
          <T v="label">{u.title}</T>
          {u.lessons.slice(0, 4).map((l) => (
            <T key={l.id} v="caption">
              • {l.title}
              {l.pages ? ` · pp. ${l.pages}` : ''}
              {l.links.length ? ' · 🔗' : ''}
            </T>
          ))}
          {u.lessons.length > 4 ? <T v="caption" muted>…and {u.lessons.length - 4} more</T> : null}
        </View>
      ))}
      {result.units.length > 6 ? <T v="caption" muted>…and {result.units.length - 6} more units</T> : null}
      {result.warnings.map((w) => (
        <T key={w} v="caption" color={c.accent}>⚠️ {w}</T>
      ))}
      <T v="caption" muted>You can rename, reorder, split, and add details to every lesson next.</T>
    </Card>
  );
}

// ───────────────────────────── From scratch

function Scratch({ onCreate }: { onCreate: Create }) {
  const [title, setTitle] = useState('');
  const [units, setUnits] = useState('3');
  const [per, setPer] = useState('5');
  const u = parseCount(units);
  const p = parseCount(per);
  const missing = [!title.trim() && 'a title', !(u && u <= 40) && 'units (1–40)', !(p && p <= 60) && 'lessons per unit (1–60)'].filter(Boolean);
  return (
    <Section title="Start from scratch" subtitle="We’ll lay out numbered units and lessons; rename them and fill in the details as you go.">
      <Field label="Curriculum title" value={title} onChangeText={setTitle} placeholder="Fractions Workshop" maxLength={160} />
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}><Field label="Units" value={units} onChangeText={setUnits} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Lessons per unit" value={per} onChangeText={setPer} keyboardType="number-pad" /></View>
      </Row>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button
          title="Create"
          disabled={missing.length > 0}
          reason={`Still needed: ${missing.join(', ')}`}
          onPress={() => {
            let n = 0;
            const plan: PackageUnit[] = Array.from({ length: u! }, (_, i) => newUnit(`Unit ${i + 1}`, Array.from({ length: p! }, () => newLesson(`Lesson ${++n}`))));
            onCreate({ title: title.trim(), units: plan, origin: { kind: 'original' } });
          }}
        />
      </Row>
    </Section>
  );
}

// ───────────────────────────── A book the family owns

function Book({ onCreate }: { onCreate: Create }) {
  const [title, setTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [toc, setToc] = useState('');
  const [perLesson, setPerLesson] = useState('');
  const [lastPage, setLastPage] = useState('');
  const per = perLesson.trim() ? parseCount(perLesson) : undefined;
  const last = lastPage.trim() ? parseCount(lastPage) : undefined;
  const result = useMemo(() => (toc.trim() ? parseOutline(toc, { pagesPerLesson: per, lastPage: last }) : { units: [], warnings: [] }), [toc, per, last]);
  const missing = [!title.trim() && 'the book’s title', !lessonTotal(result.units) && 'its table of contents'].filter(Boolean);
  const tip =
    Platform.OS === 'ios'
      ? 'Tip: point the Camera at the contents page (or open a photo of it), tap the Live Text button, select the text, and copy — then paste it here.'
      : Platform.OS === 'android'
        ? 'Tip: use Google Lens on a photo of the contents page to copy its text, then paste it here.'
        : 'Tip: on a phone, use Live Text (iPhone) or Google Lens (Android) to copy the contents page from a photo, then paste it here.';
  return (
    <>
      <Section title="Convert a book you own" subtitle="Paste the table of contents. Chapters become units, sections become lessons, and page numbers become reading ranges. Private to your family — the publisher holds the rights.">
        <Row gap={space.md} align="flex-start" wrap>
          <View style={{ flex: 2, minWidth: 220 }}><Field label="Book title" value={title} onChangeText={setTitle} placeholder="Math Level 4" maxLength={160} /></View>
          <View style={{ flex: 1, minWidth: 160 }}><Field label="Publisher (optional)" value={publisher} onChangeText={setPublisher} /></View>
        </Row>
        <Field label="Table of contents" value={toc} onChangeText={setToc} multiline style={{ minHeight: 180 }} placeholder={'Chapter 1: Whole Numbers ..... 1\n  1.1 Place Value ..... 2\n  1.2 Rounding ..... 9\nChapter 2: Fractions ..... 15'} />
        <T v="caption" muted>{tip}</T>
        <Row gap={space.md} align="flex-start" wrap>
          <View style={{ flex: 1, minWidth: 160 }}><Field label="Pages per lesson (optional)" value={perLesson} onChangeText={setPerLesson} keyboardType="number-pad" hint="Splits chapters that list no sections" /></View>
          <View style={{ flex: 1, minWidth: 160 }}><Field label="Last page (optional)" value={lastPage} onChangeText={setLastPage} keyboardType="number-pad" hint="Closes the final reading range" /></View>
        </Row>
      </Section>
      <Preview result={result} />
      <Row style={{ justifyContent: 'flex-end', marginTop: space.md }}>
        <Button
          title="Create lesson plan"
          disabled={missing.length > 0}
          reason={`Still needed: ${missing.join(', ')}`}
          onPress={() =>
            onCreate({
              title: title.trim(),
              units: result.units,
              origin: { kind: 'owned_book', title: title.trim(), publisher: publisher.trim() || undefined },
              license: { kind: 'all_rights_reserved', holder: publisher.trim() || undefined },
              format: 'print',
            })
          }
        />
      </Row>
    </>
  );
}

// ───────────────────────────── Spreadsheet

function Sheet({ onCreate }: { onCreate: Create }) {
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState('');
  const [whose, setWhose] = useState<'mine' | 'book'>('mine');
  const [book, setBook] = useState('');
  const result = useMemo(() => (rows.trim() ? parseTable(rows) : { units: [], warnings: [] }), [rows]);
  const missing = [!title.trim() && 'a title', !lessonTotal(result.units) && 'some lesson rows', whose === 'book' && !book.trim() && 'the book’s title'].filter(Boolean);
  return (
    <>
      <Section title="Import a spreadsheet" subtitle="Copy rows from Google Sheets or Excel (or a CSV) and paste them here. Recognized columns: Unit, Lesson, Pages, Minutes, Link, Steps, Questions, Notes. Separate several steps or questions with “;”.">
        <Field label="Curriculum title" value={title} onChangeText={setTitle} maxLength={160} />
        <Field label="Lesson rows" value={rows} onChangeText={setRows} multiline style={{ minHeight: 160 }} placeholder={'Unit\tLesson\tPages\tSteps\nAnimals\tMammals\t4-9\tRead; Draw a mammal'} />
        <T v="label">Whose lessons are these?</T>
        <Row wrap gap={6}>
          <Chip label="✏️ Mine — I wrote them" selected={whose === 'mine'} onPress={() => setWhose('mine')} />
          <Chip label="📕 A plan for a book I own" selected={whose === 'book'} onPress={() => setWhose('book')} />
        </Row>
        {whose === 'book' ? <Field label="Book title" value={book} onChangeText={setBook} hint="Stays private to your family." /> : null}
        <T v="caption" muted>Adapting a free online course? Use “Adapt a free curriculum” instead so its license and credit come along.</T>
      </Section>
      <Preview result={result} />
      <Row style={{ justifyContent: 'flex-end', marginTop: space.md }}>
        <Button
          title="Create lesson plan"
          disabled={missing.length > 0}
          reason={`Still needed: ${missing.join(', ')}`}
          onPress={() =>
            onCreate({
              title: title.trim(),
              units: result.units,
              ...(whose === 'book' ? { origin: { kind: 'owned_book', title: book.trim() } as Origin, license: { kind: 'all_rights_reserved' as const } } : { origin: { kind: 'original' } as Origin }),
            })
          }
        />
      </Row>
    </>
  );
}

// ───────────────────────────── Free curriculum on the web

function Web({ onCreate }: { onCreate: Create }) {
  const c = useColors();
  const [url, setUrl] = useState('');
  const [page, setPage] = useState<(WebImport & { url: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outline, setOutline] = useState('');
  const [chosen, setChosen] = useState<LicenseKind | undefined>();
  const [title, setTitle] = useState('');
  const link = normalizeUrl(url);
  const pasted = useMemo(() => (outline.trim() ? parseOutline(outline) : undefined), [outline]);
  const result: ImportResult = pasted ?? page ?? { units: [], warnings: [] };
  const license = page?.license ?? (chosen ? { kind: chosen } : undefined);
  const missing = [!page && 'load the source page', !title.trim() && 'a title', !lessonTotal(result.units) && 'lessons (from the page, or paste the outline)', page && !license && 'the source’s license (or “Not sure”)'].filter(Boolean);

  const load = async () => {
    if (!link) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetchPage(link);
      const parsed = parseWebPage(res.html, res.url);
      setPage({ ...parsed, url: res.url });
      setTitle((t) => t || `${parsed.title} (lesson plan)`.slice(0, 160));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="Adapt a free online curriculum" subtitle="Paste the address of the course’s overview or table of contents page. We read its sections and lesson links, and look for its license so your plan can keep it and credit the source.">
        <Row gap={space.sm} align="flex-end">
          <View style={{ flex: 1 }}>
            <Field label="Course page" value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" hint={url.trim() && !link ? 'Enter a web address' : undefined} />
          </View>
          <Button title="Load page" disabled={!link} loading={busy} onPress={load} />
        </Row>
        {error ? <T color={c.danger}>{error}</T> : null}
      </Section>

      {page ? (
        <>
          <Card>
            <T v="heading">🌐 {page.title}</T>
            <T v="caption" muted>{page.url}{page.author ? ` · by ${page.author}` : ''}</T>
            {page.license ? (
              <T>
                License found: <T style={{ fontWeight: '700' }}>{licenseName(page.license)}</T> — {LICENSE_INFO[page.license.kind].label}. Your plan keeps this license.
                {!LICENSE_INFO[page.license.kind].adapt ? ' It doesn’t allow sharing adapted versions, so your plan will be for your family only.' : !LICENSE_INFO[page.license.kind].commercial ? ' It’s non-commercial, so your plan must be free.' : ''}
              </T>
            ) : (
              <Stack gap={6}>
                <T>No license found on this page. Check the source’s terms (often linked in the footer) and choose what it says:</T>
                <Row wrap gap={6}>
                  {SOURCE_LICENSES.map((k) => (
                    <Chip key={k} label={k === 'all_rights_reserved' ? '© All rights reserved' : LICENSE_INFO[k].short} selected={chosen === k} onPress={() => setChosen(k)} />
                  ))}
                  <Chip label="Not sure" selected={chosen === 'unknown'} onPress={() => setChosen('unknown')} />
                </Row>
                <T v="caption" muted>Unsure or all-rights-reserved sources can still be used in your own family’s plan; they just can’t be published.</T>
              </Stack>
            )}
          </Card>
          <Field label="Your plan’s title" value={title} onChangeText={setTitle} maxLength={160} />
          <Field label="Or paste the course outline (optional)" value={outline} onChangeText={setOutline} multiline placeholder="Use this if the page’s lessons didn’t come through, or to use the course’s own outline. The source and license above are still recorded." />
          <Preview result={result} />
        </>
      ) : null}
      <Row style={{ justifyContent: 'flex-end', marginTop: space.md }}>
        <Button
          title="Create lesson plan"
          disabled={missing.length > 0}
          reason={`Still needed: ${missing.join(', ')}`}
          onPress={() =>
            page &&
            license &&
            onCreate({
              title: title.trim(),
              units: result.units,
              origin: { kind: 'open_web', url: page.url, title: page.title, author: page.author, retrievedAt: new Date().toISOString(), licenseDetected: !!page.license },
              license,
              format: 'online',
              price: 0,
            })
          }
        />
      </Row>
    </>
  );
}
