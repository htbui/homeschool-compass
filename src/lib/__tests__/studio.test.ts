import { describe, expect, it } from 'vitest';

import { linkScanPages, parseOutline, parseScanRecord, parseTable, parseWebPage, sourceAddress, splitRows } from '../importers';
import { detectLicense, licenseUrl } from '../license';
import { allLessons, attributionFor, lessonAt, newLesson, newPackage, newUnit, packageToListing, publishIssues, publishRules } from '../package';

const titles = (r: { units: { title: string; lessons: { title: string; pages?: string }[] }[] }) => r.units.map((u) => [u.title, u.lessons.map((l) => `${l.title}${l.pages ? ` [${l.pages}]` : ''}`)]);

describe('table of contents import', () => {
  it('reads chapters, lessons, dot leaders and page ranges', () => {
    const r = parseOutline(`Chapter 1: Whole Numbers ........ 1
  1.1 Place Value ........ 2
  1.2 Rounding ........ 9
Chapter 2: Fractions ........ 15
  2.1 What Is a Fraction? ........ 16
  2.2 Equivalent Fractions ........ 22`, { lastPage: 30 });
    expect(titles(r)).toEqual([
      ['Chapter 1: Whole Numbers', ['1.1 Place Value [2–8]', '1.2 Rounding [9–14]']],
      ['Chapter 2: Fractions', ['2.1 What Is a Fraction? [16–21]', '2.2 Equivalent Fractions [22–30]']],
    ]);
  });

  it('keeps "Lesson 5" as a title, not a page number', () => {
    const r = parseOutline('Unit 1\nLesson 1\nLesson 2\nUnit 2\nLesson 3');
    expect(titles(r)).toEqual([['Unit 1', ['Lesson 1', 'Lesson 2']], ['Unit 2', ['Lesson 3']]]);
  });

  it('uses indentation when there are no unit words', () => {
    const r = parseOutline('Ancient Egypt\n  The Nile\n  Pyramids\nAncient Greece\n  City States');
    expect(titles(r)).toEqual([['Ancient Egypt', ['The Nile', 'Pyramids']], ['Ancient Greece', ['City States']]]);
  });

  it('splits chapter-only contents into lessons by pages', () => {
    const r = parseOutline('Chapter 1 Numbers 1\nChapter 2 Shapes 21', { pagesPerLesson: 10, lastPage: 40 });
    expect(titles(r)).toEqual([
      ['Chapter 1 Numbers', ['Chapter 1 Numbers (1 of 2) [1–10]', 'Chapter 1 Numbers (2 of 2) [11–20]']],
      ['Chapter 2 Shapes', ['Chapter 2 Shapes (1 of 2) [21–30]', 'Chapter 2 Shapes (2 of 2) [31–40]']],
    ]);
  });

  it('picks up bullets, links, and written page ranges', () => {
    const r = parseOutline('# Week 1\n- Day 1: Read pp. 12-18\n- Day 2 video https://example.org/v/2');
    expect(r.units[0].title).toBe('Week 1');
    expect(r.units[0].lessons[0].pages).toBe('12–18');
    expect(r.units[0].lessons[1].links[0].url).toBe('https://example.org/v/2');
    expect(r.units[0].lessons[1].title).toBe('Day 2 video');
  });

  it('warns on empty input', () => {
    expect(parseOutline('  \n ').warnings[0]).toMatch(/Nothing to import/);
  });
});

describe('spreadsheet import', () => {
  it('splits quoted CSV cells', () => {
    expect(splitRows('a,"b, c","say ""hi"""\n1,2,3')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });

  it('maps common headers and groups by unit', () => {
    const r = parseTable('Unit\tLesson\tPages\tMinutes\tLink\tSteps\tQuestions\nAnimals\tMammals\t4-9\t25\thttps://example.org/m\tRead; Draw a mammal\tWhat is a mammal?\nAnimals\tBirds\t10-14\t\t\t\t\nPlants\tSeeds\t15-20\t\t\t\t');
    expect(titles(r)).toEqual([['Animals', ['Mammals [4–9]', 'Birds [10–14]']], ['Plants', ['Seeds [15–20]']]]);
    const m = r.units[0].lessons[0];
    expect(m.minutes).toBe(25);
    expect(m.steps).toEqual(['Read', 'Draw a mammal']);
    expect(m.questions).toEqual(['What is a mammal?']);
    expect(m.links[0].url).toBe('https://example.org/m');
  });

  it('falls back to the first column without headers', () => {
    const keyed = parseTable('Lesson\tQuestions\tAnswer key\nHalves\tHalf of 4?; Half of 8?\t2; 4');
    expect(keyed.units[0].lessons[0].answers).toEqual(['2', '4']);
    expect(parseTable('Lesson\tQuestions\nHalves\tHalf of 4?').units[0].lessons[0].answers).toBeUndefined();
    const r = parseTable('Counting\nAdding\n');
    expect(titles(r)).toEqual([['Lessons', ['Counting', 'Adding']]]);
    expect(r.warnings[0]).toMatch(/No header row/);
  });
});

describe('licenses', () => {
  it('detects Creative Commons badges and written statements', () => {
    expect(detectLicense('<a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/">')).toMatchObject({ kind: 'cc_by_nc_sa', version: '4.0' });
    expect(detectLicense('<p>This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License.</p>')).toMatchObject({ kind: 'cc_by_sa', version: '3.0' });
    expect(detectLicense('<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>')).toMatchObject({ kind: 'cc0' });
    expect(detectLicense('<p>© 2024 Example Press. All rights reserved.</p>')).toBeUndefined();
    expect(licenseUrl({ kind: 'cc_by', version: '4.0' })).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('keeps book conversions private and enforces the source license', () => {
    const book = newPackage({ origin: { kind: 'owned_book', title: 'Math 4' } });
    expect(publishRules(book).canPublish).toBe(false);
    const web = (kind: Parameters<typeof publishRules>[0]['license']['kind'], confirmed = true) =>
      publishRules({ origin: { kind: 'open_web', url: 'https://x.org', title: 'X', retrievedAt: '', licenseDetected: true }, license: { kind }, licenseConfirmed: confirmed });
    expect(web('cc_by_nc_sa')).toMatchObject({ canPublish: true, mustBeFree: true, licenseLocked: true });
    expect(web('cc_by')).toMatchObject({ canPublish: true, mustBeFree: false });
    expect(web('cc_by_nd').canPublish).toBe(false);
    expect(web('all_rights_reserved').canPublish).toBe(false);
    expect(web('unknown').canPublish).toBe(false);
    expect(web('cc_by', false).canPublish).toBe(false);
    expect(publishRules(newPackage()).canPublish).toBe(true);
  });

  it('credits the source', () => {
    const pkg = newPackage({ title: 'Botany', origin: { kind: 'open_web', url: 'https://free.example.org/botany', title: 'Open Botany', author: 'Jo Fern', retrievedAt: '', licenseDetected: true }, license: { kind: 'cc_by_sa', version: '4.0' } });
    expect(attributionFor(pkg, 'Studio Kim')).toBe('Adapted from “Open Botany” by Jo Fern (https://free.example.org/botany), licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Organized into lessons by Studio Kim.');
  });
});

describe('packages', () => {
  const pkg = newPackage({
    title: 'Fractions Workshop',
    description: 'Hands-on fractions for curious 4th graders.',
    subjects: ['math'],
    price: 12,
    units: [newUnit('Halves', [newLesson('Fold paper', { steps: ['Fold', 'Color'] }), newLesson('Share a pizza')]), newUnit('Quarters', [newLesson('Quarter hours', { questions: ['What is 1/4 of 60?'] })])],
  });

  it('numbers lessons across units', () => {
    expect(allLessons(pkg.units).map((l) => `${l.n} ${l.unit}: ${l.title}`)).toEqual(['1 Halves: Fold paper', '2 Halves: Share a pizza', '3 Quarters: Quarter hours']);
    expect(lessonAt(pkg.units, 3)?.title).toBe('Quarter hours');
    expect(lessonAt(pkg.units, 4)).toBeUndefined();
  });

  it('lists what is missing before publishing', () => {
    expect(publishIssues(pkg)).toEqual([]);
    expect(publishIssues({ ...pkg, title: '', units: [newUnit('U', [newLesson('')])] })).toEqual(['a title', 'a title for every lesson']);
    const nc = { ...pkg, origin: { kind: 'open_web' as const, url: 'https://x.org', title: 'X', retrievedAt: '', licenseDetected: true }, license: { kind: 'cc_by_nc' as const }, licenseConfirmed: true };
    expect(publishIssues(nc)).toContain('a price of $0 (the source is non-commercial)');
    expect(packageToListing(nc, 'Kim').price).toBe(0);
  });

  it('becomes a listing with a public outline', () => {
    const l = packageToListing(pkg, 'Studio Kim');
    expect(l).toMatchObject({ title: 'Fractions Workshop', sellerKind: 'creator', lessons: 3, price: 12, packageId: pkg.id });
    expect(l.outline).toEqual([{ title: 'Halves', lessons: ['Fold paper', 'Share a pizza'] }, { title: 'Quarters', lessons: ['Quarter hours'] }]);
    expect(l.includes).toContain('Printable worksheet questions');
  });
});

describe('web page import', () => {
  const html = `<html><head><title>Open Botany for Kids</title><meta name="author" content="Jo Fern"></head><body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <h1>Open Botany</h1>
    <h2>Unit 1: Seeds</h2>
    <ul><li><a href="/lessons/seed-parts">Parts of a seed</a></li><li><a href="lessons/sprouting.html">Sprouting beans</a></li></ul>
    <h2>Unit 2: Leaves</h2>
    <ul><li><a href="https://free.example.org/lessons/leaf-shapes">Leaf shapes</a></li><li>Leaf rubbing art</li></ul>
    <h2>Share</h2><a href="https://facebook.com/x">Facebook</a>
  </main>
  <footer><a rel="license" href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a></footer></body></html>`;

  it('turns headings into units and links into lessons, with license and author', () => {
    const r = parseWebPage(html, 'https://free.example.org/botany/');
    expect(r.title).toBe('Open Botany for Kids');
    expect(r.author).toBe('Jo Fern');
    expect(r.license).toMatchObject({ kind: 'cc_by_nc', version: '4.0' });
    expect(titles(r)).toEqual([['Unit 1: Seeds', ['Parts of a seed', 'Sprouting beans']], ['Unit 2: Leaves', ['Leaf shapes', 'Leaf rubbing art']]]);
    expect(r.units[0].lessons[0].links[0].url).toBe('https://free.example.org/lessons/seed-parts');
    expect(r.units[0].lessons[1].links[0].url).toBe('https://free.example.org/botany/lessons/sprouting.html');
  });

  it('skips wiki housekeeping links (edit, history, special pages)', () => {
    const wiki = `<html><title>Arithmetic - Wikibooks</title><body><main>
      <div class="mw-heading"><h2>Unit 1</h2><span class="mw-editsection">[<a href="/w/index.php?title=Arithmetic&action=edit&section=1">edit</a>]</span></div>
      <ul><li><a href="/wiki/Arithmetic/Counting">Counting</a></li><li><a href="/wiki/Special:Search">Search tools</a></li><li><a href="/w/index.php?title=Arithmetic&printable=yes">Printable version</a></li></ul>
      </main><footer>Text is available under the <a href="https://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike License</a></footer></body></html>`;
    const r = parseWebPage(wiki, 'https://en.wikibooks.org/wiki/Arithmetic');
    expect(titles(r)).toEqual([['Unit 1', ['Counting']]]);
    expect(r.license).toMatchObject({ kind: 'cc_by_sa', version: '4.0' });
  });

  it('says so when a page has no lessons or license', () => {
    const r = parseWebPage('<html><title>Blank</title><body><p>Hello</p></body></html>', 'https://x.example.org');
    expect(r.units).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Couldn’t find a list of lessons/);
    expect(r.warnings.join(' ')).toMatch(/No license found/);
  });
});

describe('books and scans', () => {
  const GUTENBERG = `<html><head><title>The Project Gutenberg eBook of Bird Book</title></head><body>
    <header><p><strong>Title</strong>: The Bird Book</p><p><strong>Author</strong>: T. W. Burgess</p>
    <p>This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost.</p></header>
    <h2>CONTENTS</h2>
    <p><a href="#ch1" class="pginternal">CHAPTER I.</a> Jenny Wren Arrives.<br><a href="#ch2">CHAPTER II.</a> The Old Orchard Bully.<br><a href="#ch3">CHAPTER III.</a> Sparrows.</p>
    <h2><a id="ch1"></a>CHAPTER I. Jenny Wren Arrives</h2><p>Text</p>
    <h2><a id="ch2"></a>CHAPTER II. The Old Orchard Bully</h2><p>Text</p>
    <h2><a id="ch3"></a>CHAPTER III. Sparrows</h2><p>Text</p></body></html>`;
  const url = 'https://www.gutenberg.org/cache/epub/1/pg1-images.html';

  it('reads a whole book on one page: chapters, author, and public-domain status', () => {
    const r = parseWebPage(GUTENBERG, url);
    expect(r).toMatchObject({ title: 'The Bird Book', author: 'T. W. Burgess', license: { kind: 'public_domain' } });
    const lessons = r.units.flatMap((u) => u.lessons);
    expect(lessons.map((l) => l.title)).toEqual(['CHAPTER I. Jenny Wren Arrives.', 'CHAPTER II. The Old Orchard Bully.', 'CHAPTER III. Sparrows.']);
    expect(lessons[1].links[0].url).toBe(`${url}#ch2`);
  });

  it('falls back to chapter headings when there are no contents links', () => {
    const r = parseWebPage(GUTENBERG.replace(/<p><a href="#ch1[\s\S]*?<\/p>/, ''), url);
    expect(r.units.flatMap((u) => u.lessons).map((l) => l.links[0].url.split('#')[1])).toEqual(['ch1', 'ch2', 'ch3']);
  });

  it('marks copyrighted Gutenberg books as unknown', () => {
    expect(parseWebPage(GUTENBERG.replace('This eBook', 'Copyrighted Project Gutenberg eBook. This eBook'), url).license).toBeUndefined();
  });

  it('explains script-built sites instead of finding nothing', () => {
    const r = parseWebPage(`<html><body><div id="root"></div>${'<script src="a.js"></script>'.repeat(5)}</body></html>`, 'https://www.khanacademy.org/math/cc-third-grade-math');
    expect(r.units).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/builds its pages with scripts/);
  });

  it('turns Gutenberg and archive.org addresses into what to read', () => {
    expect(sourceAddress('https://www.gutenberg.org/ebooks/3074')).toEqual({ kind: 'gutenberg', fetchUrl: 'https://www.gutenberg.org/cache/epub/3074/pg3074-images.html' });
    expect(sourceAddress('https://archive.org/details/raysnewprimarya00raygoog/page/n5')).toMatchObject({ kind: 'scan', scanId: 'raysnewprimarya00raygoog' });
    expect(sourceAddress('https://example.org/course').kind).toBe('page');
  });

  it('reads archive.org records and links pasted contents to scan pages', () => {
    const rec = { metadata: { title: "Ray's new primary arithmetic", creator: 'Ray, Joseph', date: '1877', 'possible-copyright-status': 'NOT_IN_COPYRIGHT' } };
    expect(parseScanRecord(JSON.stringify(rec))).toEqual({ title: "Ray's new primary arithmetic", author: 'Ray, Joseph', year: 1877, publicDomain: true });
    expect(parseScanRecord(JSON.stringify({ metadata: { ...rec.metadata, date: '1955' } })).publicDomain).toBe(false);
    const units = parseOutline('Lesson I .... 5\nLesson II .... 7\nLesson III .... 9').units;
    expect(linkScanPages(units, 'rays', 7)[0].lessons.map((l) => l.links[0].url)).toEqual([
      'https://archive.org/details/rays/page/n11/mode/1up',
      'https://archive.org/details/rays/page/n13/mode/1up',
      'https://archive.org/details/rays/page/n15/mode/1up',
    ]);
    expect(linkScanPages(units, 'rays')[0].lessons[0].links[0].url).toBe('https://archive.org/details/rays/page/5/mode/1up');
  });
});
