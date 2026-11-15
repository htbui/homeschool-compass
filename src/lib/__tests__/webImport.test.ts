import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { jsonObjectAt, listTrees } from '../html';
import { followNext, parseLibreTexts, parseWebPage, sourceAddress } from '../importers';

// Trimmed copies of real pages (structure kept, most items cut).
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const outline = (r: { units: { title: string; lessons: { title: string }[] }[] }) => r.units.map((u) => [u.title, u.lessons.map((l) => l.title)]);
const urls = (r: { units: { lessons: { links: { url: string }[] }[] }[] }) => r.units.flatMap((u) => u.lessons.map((l) => l.links[0]?.url));

describe('page helpers', () => {
  it('read a script’s JSON object even when its strings hold braces and quotes', () => {
    const html = '<script>var data = {"a":"} not the end {","b":{"c":"say \\"hi\\""}};</script>';
    expect(jsonObjectAt(html, html.indexOf('data'))).toEqual({ a: '} not the end {', b: { c: 'say "hi"' } });
    expect(jsonObjectAt('var x = {broken', 0)).toBeUndefined();
  });

  it('read nested lists as trees', () => {
    const [list] = listTrees('<ul class="toc"><li>One<ol><li>1a</li><li>1b</li></ol></li><li>Two</li></ul>');
    expect(list.cls).toBe('toc');
    expect(list.items.map((i) => [i.own.trim(), i.children.map((c) => c.own)])).toEqual([['One', ['1a', '1b']], ['Two', []]]);
  });
});

describe('YouTube playlists', () => {
  const url = 'https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF';

  it('become one lesson per video, from the page’s own data', () => {
    const r = parseWebPage(fixture('youtube-playlist.html'), url);
    expect(r.format).toBe('playlist');
    expect(r.title).toBe('Biology (2012)');
    expect(r.author).toBe('CrashCourse');
    expect(r.units[0].lessons.slice(0, 2).map((l) => [l.title, l.links[0]])).toEqual([
      ['Crash Course Biology Preview', { label: 'Watch', url: 'https://www.youtube.com/watch?v=gMOoMcsGTO4&list=PL3EED4C1D684D3ADF' }],
      ['Carbon... SO SIMPLE: Crash Course Biology #1', { label: 'Watch', url: 'https://www.youtube.com/watch?v=QnQe0xW_JY4&list=PL3EED4C1D684D3ADF' }],
    ]);
    // A video's license is its creator's: never guessed from the page.
    expect(r.license).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/belong to their creators/);
  });

  it('reads the older playlist format too', () => {
    const html = `<script>window["ytInitialData"] = {"contents":[{"playlistVideoRenderer":{"videoId":"abc123def45","title":{"runs":[{"text":"Lesson one"}]}}},{"playlistVideoRenderer":{"videoId":"xyz","title":{"simpleText":"[Deleted video]"}}}]};</script>`;
    expect(outline(parseWebPage(html, url))).toEqual([['Videos', ['Lesson one']]]);
  });

  it('falls back to a pasted list when the videos can’t be read', () => {
    const r = parseWebPage('<html><title>Before you continue to YouTube</title><body><form>Accept all</form></body></html>', url);
    expect(r.units).toEqual([]);
    expect(r.warnings[0]).toMatch(/paste it below/);
  });

  it('a video watched from a playlist loads the whole playlist', () => {
    expect(sourceAddress('https://www.youtube.com/watch?v=QnQe0xW_JY4&list=PL3EED4C1D684D3ADF&index=2')).toEqual({ kind: 'playlist', fetchUrl: url });
    expect(sourceAddress('https://youtu.be/QnQe0xW_JY4?list=PL3EED4C1D684D3ADF').fetchUrl).toBe(url);
    expect(sourceAddress('https://www.youtube.com/watch?v=QnQe0xW_JY4').kind).toBe('page');
  });
});

describe('open textbooks', () => {
  it('Pressbooks: units by part, lessons by chapter, the book’s own license', () => {
    const r = parseWebPage(fixture('pressbooks-toc.html'), 'https://open.oregonstate.education/anatomy2e/');
    expect(r.format).toBe('textbook');
    expect(r.title).toBe('Anatomy & Physiology 2e');
    expect(r.author).toMatch(/^Lindsay M. Biga, Staci Bronson, Sierra Dawson, and others$/);
    expect(outline(r)).toEqual([
      ['1. An Introduction to the Human Body', ['1.0 Introduction: Human Body', '1.1 How Structure Determines Function', '1.2 Structural Organization of the Human Body']],
      ['2. The Chemical Level of Organization', ['2.0 Introduction: Chemical Level of Organization', '2.1 Elements and Atoms: The Building Blocks of Matter', '2.2 Chemical Bonds']],
    ]);
    expect(urls(r)[0]).toBe('https://open.oregonstate.education/anatomy2e/chapter/intro-human-body/');
    // The page also links CC BY (an icon credit); the book itself is CC BY-NC-SA.
    expect(r.license).toEqual({ kind: 'cc_by_nc_sa', version: '4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' });
  });

  it('Pressbooks: a chapter page points to its book’s table of contents', () => {
    const chapter = '<html><head><link rel="stylesheet" href="/app/themes/pressbooks-book/dist/styles/book.css"></head><body><main><h1>1.1 How Structure Determines Function</h1><p>Text…</p></main></body></html>';
    const r = parseWebPage(chapter, 'https://open.oregonstate.education/anatomy2e/chapter/how-structure-determines-function/');
    expect(r.next).toMatchObject({ url: 'https://open.oregonstate.education/anatomy2e/', kind: 'page', auto: true });
  });

  it('LibreTexts: the book page points to its public outline', () => {
    const r = parseWebPage(fixture('libretexts-book.html'), 'https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax)');
    expect(r.next).toMatchObject({ url: 'https://commons.libretexts.org/api/v1/commons/book/math-4969/licensereport', kind: 'libretexts', auto: true });
    expect(r.title).toBe('Prealgebra 1e (OpenStax)');
  });

  it('LibreTexts: units by chapter, lessons by section in book order, and its mixed licenses spelled out', () => {
    const r = parseLibreTexts(fixture('libretexts-licensereport.json'));
    expect(r.title).toBe('Prealgebra 1e (OpenStax)');
    expect(outline(r)).toEqual([
      ['1: Whole Numbers', ['1.1: Introduction to Whole Numbers (Part 1)', '1.2: Introduction to Whole Numbers (Part 2)', '1.E: Whole Numbers (Exercises)', '1.S: Whole Numbers (Summary)']],
      ['2: Introduction to the Language of Algebra', ['2.1: Use the Language of Algebra (Part 1)', '2.2: Use the Language of Algebra (Part 2)', '2.E: Introduction to the Language of Algebra (Exercises)', '2.S: Introduction to the Language of Algebra (Summary)']],
    ]);
    expect(urls(r)[0]).toBe('https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax)/01%3A_Whole_Numbers/1.01%3A_Introduction_to_Whole_Numbers_(Part_1)');
    expect(r.license).toEqual({ kind: 'cc_by', version: '4.0', url: 'https://creativecommons.org/licenses/by/4.0/' });
    expect(r.warnings[0]).toMatch(/different licenses: CC BY \(150 pages\), no license stated \(1 page\)/);
  });

  it('LibreTexts: loading the book reads its outline next, keeping the book’s address as the source', async () => {
    const bookUrl = 'https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax)';
    const first = { ...parseWebPage(fixture('libretexts-book.html'), bookUrl), url: bookUrl };
    const asked: string[] = [];
    const r = await followNext(first, async (u) => {
      asked.push(u);
      return { url: u, html: fixture('libretexts-licensereport.json') };
    });
    expect(asked).toEqual(['https://commons.libretexts.org/api/v1/commons/book/math-4969/licensereport']);
    expect(r.url).toBe(bookUrl);
    expect(r.units.map((u) => u.title)).toEqual(['1: Whole Numbers', '2: Introduction to the Language of Algebra']);
    expect(r.next).toBeUndefined();
    // The outline can't be read: the book page's own chapter list stays.
    const kept = await followNext(first, async () => {
      throw new Error('That page answered 503.');
    });
    expect(kept.units).toBe(first.units);
  });

  it('LibreTexts: the most restrictive license wins', () => {
    const report = JSON.stringify({
      data: {
        meta: { mostRestrictiveLicense: { label: 'CC BY-NC-SA', raw: 'ccbyncsa', version: '4.0', link: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }, licenses: [{ label: 'CC BY', raw: 'ccby', count: 9 }, { label: 'CC BY-NC-SA', raw: 'ccbyncsa', count: 3 }] },
        text: { title: 'Biology', children: [{ title: '1: Cells', children: [{ title: '1.1: Parts of a Cell', url: 'https://bio.libretexts.org/1.1' }] }] },
      },
    });
    const r = parseLibreTexts(report);
    expect(r.license?.kind).toBe('cc_by_nc_sa');
    expect(r.warnings[0]).toMatch(/CC BY \(9 pages\), CC BY-NC-SA \(3 pages\)/);
    expect(parseLibreTexts('not json').units).toEqual([]);
  });

  it('Wikibooks: chapters with subpages become units; the print version is offered', () => {
    const r = parseWebPage(fixture('wikibooks-main.html'), 'https://en.wikibooks.org/wiki/Arithmetic');
    expect(r.title).toBe('Arithmetic');
    expect(r.license).toMatchObject({ kind: 'cc_by_sa', version: '4.0' });
    const o = outline(r);
    expect(o.map((u) => u[0])).toEqual(['Preface', 'Unit 1: Beginning Arithmetic', 'Unit 2: Basic Arithmetic', 'More About Multiplication', 'Unit 2: Basic Arithmetic', 'Unit 3: Intermediate Arithmetic']);
    expect(o[3][1]).toEqual(['More About Multiplication', 'Fundamental Theorem of Arithmetic']);
    // The "Front" section (cover, authors) and wiki housekeeping links are left out.
    expect(o.flatMap((u) => u[1])).not.toContain('Cover');
    expect(r.next).toMatchObject({ url: 'https://en.wikibooks.org/wiki/Arithmetic/Printable_version', auto: false });
  });

  it('Wikibooks print version: lessons by section, linked to each chapter’s own page', () => {
    const r = parseWebPage(fixture('wikibooks-print.html'), 'https://en.wikibooks.org/wiki/Arithmetic/Printable_version');
    expect(r.title).toBe('Arithmetic');
    const o = outline(r);
    expect(o[1]).toEqual(['Chapter 1', ['Definition of Arithmetic', 'History of Arithmetic', 'The four basic operations', 'Types of numbers', 'Basic operation properties', 'What\'s next?']]);
    expect(o[2][1].slice(0, 2)).toEqual(['1. Natural Numbers (N)', '2. Whole Numbers']);
    expect(o.map((u) => u[0])).toContain('Number Operations: Addition');
    expect(o.map((u) => u[0])).not.toContain('Cover');
    expect(r.units[1].lessons[0].links[0].url).toBe('https://en.wikibooks.org/wiki/Arithmetic/Chapter_1#Definition_of_Arithmetic');
  });

  it('Wikiversity: a course’s nested lesson list becomes units', () => {
    const r = parseWebPage(fixture('wikiversity-course.html'), 'https://en.wikiversity.org/wiki/Introduction_to_Computers');
    const o = outline(r);
    expect(o.slice(0, 3)).toEqual([
      ['Introduction', ['What is a computer?', 'History of computers', 'Computer types', 'Hardware and software', 'Basic operations', 'Data sizes and speeds']],
      ['Inside a computer case', ['Motherboard', 'Processor', 'Memory', 'Disks']],
      ['Peripherals', ['Input Devices', 'Output Devices', 'Future Peripherals']],
    ]);
    // Completion-status icons link to help pages; they're never lessons.
    expect(urls(r).every((u) => u?.startsWith('https://en.wikiversity.org/wiki/Introduction_to_Computers/'))).toBe(true);
    expect(r.license?.kind).toBe('cc_by_sa');
  });
});

describe('outline formats', () => {
  it('schema.org Course data (JSON-LD) → units and lessons, with its license', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Pond Life',
      author: { '@type': 'Person', name: 'Ada Reed' },
      license: 'https://creativecommons.org/licenses/by/4.0/',
      hasPart: [
        { '@type': 'Course', name: 'Week 1: Water', hasPart: [{ '@type': 'LearningResource', name: 'What lives in a pond', url: '/pond/1' }, { '@type': 'LearningResource', name: 'Water drops', url: '/pond/2' }] },
        { '@type': 'Course', name: 'Week 2: Frogs', hasPart: [{ '@type': 'LearningResource', name: 'Frog life cycle', url: '/pond/3' }] },
      ],
    };
    const html = `<html><head><title>Pond</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><div id="app"></div></body></html>`;
    const r = parseWebPage(html, 'https://free.example.org/pond/');
    expect(outline(r)).toEqual([['Week 1: Water', ['What lives in a pond', 'Water drops']], ['Week 2: Frogs', ['Frog life cycle']]]);
    expect(urls(r)[0]).toBe('https://free.example.org/pond/1');
    expect(r).toMatchObject({ title: 'Pond Life', author: 'Ada Reed', license: { kind: 'cc_by', version: '4.0' } });
  });

  it('schema.org ItemList → lessons in position order; breadcrumbs are ignored', () => {
    const list = { '@type': 'ItemList', name: 'Nature walks', itemListElement: [3, 1, 2].map((n) => ({ '@type': 'ListItem', position: n, name: `Walk ${n}`, url: `https://x.example.org/walk/${n}` })) };
    const crumbs = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.example.org/' }] };
    const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [crumbs, list] })}</script>`;
    expect(outline(parseWebPage(html, 'https://x.example.org/walks'))).toEqual([['Lessons', ['Walk 1', 'Walk 2', 'Walk 3']]]);
  });

  it('nested lists → units from the outer items, lessons from the inner ones', () => {
    const html = `<html><body><main><h1>Botany</h1>
      <ol>
        <li>Seeds<ul><li><a href="/b/seeds-1">How seeds sprout</a></li><li><a href="/b/seeds-2">Seed hunt</a></li></ul></li>
        <li>Leaves<ul><li><a href="/b/leaves-1">Leaf shapes</a></li></ul></li>
      </ol>
      <ul class="menu"><li>Shop<ul><li><a href="/shop">Store</a></li></ul></li><li>More<ul><li><a href="/x">X</a></li></ul></li></ul>
    </main></body></html>`;
    const r = parseWebPage(html, 'https://free.example.org/botany/');
    expect(outline(r)).toEqual([['Seeds', ['How seeds sprout', 'Seed hunt']], ['Leaves', ['Leaf shapes']]]);
  });
});
