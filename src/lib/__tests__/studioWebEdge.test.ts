import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { followNext, gutenbergInfo, linkScanPages, parseOutline, parseScanRecord, parseWebPage, sourceAddress, type WebImport } from '../importers';
import { lessonTotal, type PackageUnit } from '../package';
import { chunkUnits, jsonLdInfo, lessonHref, licenseFrom, parseJsonLdOutline, parseLibreTexts, parsePressbooks, parseYouTubePlaylist, playlistId } from '../sites';

// Studio & Community: web import, one parser at a time, with fixtures of each
// kind of page (generic course page, Project Gutenberg, archive.org scans,
// YouTube, Pressbooks, LibreTexts, Wikibooks, schema.org JSON-LD, nested lists,
// and pages built by scripts).

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const outline = (r: { units: PackageUnit[] }) => r.units.map((u) => [u.title, u.lessons.map((l) => l.title)]);
const links = (r: { units: PackageUnit[] }) => r.units.flatMap((u) => u.lessons.map((l) => l.links[0]?.url));

describe('generic course page', () => {
  const r = parseWebPage(fixture('generic-course.html'), 'https://garden.example.org/backyard/');

  it('reads units from headings and lessons from the links and items under them', () => {
    expect(outline(r)).toEqual([
      ['Unit 1: Seeds', ['What is a seed?', 'Sprouting beans in a jar', 'Seed worksheet']],
      ['Unit 2: Soil', ['Soil layers in a jar', 'Worm hotel']],
    ]);
  });

  it('resolves relative links, drops duplicates, and keeps file links on sites like Dropbox', () => {
    expect(links(r)).toEqual([
      'https://garden.example.org/backyard/lessons/what-is-a-seed.html',
      'https://garden.example.org/backyard/lessons/sprouting',
      'https://www.dropbox.com/s/abc/seed-worksheet.pdf',
      undefined,
      'https://garden.example.org/backyard/lessons/worms#top',
    ]);
  });

  it('ignores navigation, sidebars, footers, social, mail and script links, and "see also"/"references" sections', () => {
    const all = JSON.stringify(r.units);
    for (const t of ['Home', 'Biology course', 'Our other course', 'Share', 'Email the teacher', 'Toggle answers', 'A different course', 'A research paper', 'Privacy']) expect(all).not.toContain(`"${t}"`);
  });

  it('takes the title from og:title (decoded), the author from meta, and the footer license', () => {
    expect(r.title).toBe('Backyard Science & Nature Study');
    expect(r.author).toBe('Open Garden Project');
    expect(r.license).toEqual({ kind: 'cc_by_nc_sa', version: '4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' });
    expect(r.format).toBe('page');
  });

  it('says when sections without lessons were left out', () => {
    expect(r.warnings).toEqual(['Some sections without lessons were left out.']);
  });

  it('falls back to <title>, then <h1>, then the site name', () => {
    expect(parseWebPage('<title> A  title </title><h2>U</h2><ul><li><a href="/a">Alpha</a></li></ul>', 'https://x.example.org/').title).toBe('A title');
    expect(parseWebPage('<h1>Heading <b>one</b></h1>', 'https://x.example.org/').title).toBe('Heading one');
    expect(parseWebPage('<p>nothing</p>', 'https://x.example.org/').title).toBe('x.example.org');
  });

  it('caps very long pages at 60 units of 200 lessons', () => {
    const items = Array.from({ length: 250 }, (_, i) => `<li><a href="/l/${i}">Lesson number ${i}</a></li>`).join('');
    const units = Array.from({ length: 70 }, (_, u) => `<h2>Unit ${u}</h2><ul>${u === 0 ? items : `<li><a href="/u/${u}">Only lesson ${u}</a></li>`}</ul>`).join('');
    const big = parseWebPage(`<main>${units}</main>`, 'https://x.example.org/');
    expect(big.units).toHaveLength(60);
    expect(big.units[0].lessons).toHaveLength(200);
  });

  it('only treats http(s) links as lessons, and never Creative Commons or wiki housekeeping links', () => {
    const base = new URL('https://x.example.org/course/');
    expect(lessonHref('ftp://x.example.org/a', base)).toBeUndefined();
    expect(lessonHref('https://creativecommons.org/licenses/by/4.0/', base)).toBeUndefined();
    expect(lessonHref('/w/index.php?title=X&action=edit', base)).toBeUndefined();
    expect(lessonHref('https://twitter.com/share', base)).toBeUndefined();
    expect(lessonHref('https://mobile.twitter.com/share', base)).toBeUndefined();
    expect(lessonHref('https://box.com/s/worksheet', base)?.href).toBe('https://box.com/s/worksheet');
    expect(lessonHref('https://netflix.com/title/1', base)?.href).toBe('https://netflix.com/title/1');
    expect(lessonHref('lesson-1.html', base)?.href).toBe('https://x.example.org/course/lesson-1.html');
    expect(lessonHref('http://[bad', base)).toBeUndefined();
  });
});

describe('Project Gutenberg', () => {
  const url = 'https://www.gutenberg.org/cache/epub/2290/pg2290-images.html';
  const r = parseWebPage(fixture('gutenberg-book.html'), url);

  it('a book page points to the whole book (one HTML page)', () => {
    expect(sourceAddress('https://www.gutenberg.org/ebooks/2290')).toEqual({ kind: 'gutenberg', fetchUrl: 'https://www.gutenberg.org/cache/epub/2290/pg2290-images.html' });
    expect(sourceAddress('https://gutenberg.org/ebooks/2290.html.images')).toEqual({ kind: 'gutenberg', fetchUrl: 'https://www.gutenberg.org/cache/epub/2290/pg2290-images.html' });
    expect(sourceAddress(url)).toEqual({ kind: 'gutenberg', fetchUrl: url });
  });

  it('each contents line becomes a lesson linking to its chapter, with the name after the label', () => {
    expect(outline(r)).toEqual([['Lessons', ['CHAPTER I. Jenny Wren Arrives', 'CHAPTER II. The Old Orchard Bully', 'CHAPTER III. Jenny Wren\'s Cousin', 'CHAPTER IV. The Watchman of the Old Orchard']]]);
    expect(links(r)[0]).toBe(`${url}#CHAPTER_I`);
  });

  it('reads the title, author, and US public-domain status from the header', () => {
    expect(r).toMatchObject({ title: 'The Burgess Bird Book for Children', author: 'Thornton W. Burgess', license: { kind: 'public_domain' } });
    expect(r.warnings).toEqual(['This looks like a whole book on one page, so each chapter became a lesson. Group them into units in the editor if you like.']);
  });

  it('copyrighted Gutenberg books get no license (and the no-license warning stays)', () => {
    const copyrighted = fixture('gutenberg-book.html').replace('This ebook is for the use', 'This is a Copyrighted Project Gutenberg eBook. This ebook is for the use');
    expect(gutenbergInfo(copyrighted)?.license).toBeUndefined();
    expect(parseWebPage(copyrighted, url).warnings.join(' ')).toMatch(/No license found/);
    expect(gutenbergInfo('<p>Not a Gutenberg page</p>')).toBeUndefined();
  });
});

describe('archive.org scans', () => {
  it('a scan address (even a page in the viewer) points to its record', () => {
    expect(sourceAddress('https://archive.org/details/raysnewprimaryar00rayj/page/n5/mode/2up')).toEqual({ kind: 'scan', fetchUrl: 'https://archive.org/metadata/raysnewprimaryar00rayj', scanId: 'raysnewprimaryar00rayj' });
    expect(sourceAddress('https://archive.org/search?query=ray').kind).toBe('page');
  });

  it('reads the record: first creator, year, and public domain only before 1930 and not in copyright', () => {
    const rec = fixture('archive-scan.json');
    expect(parseScanRecord(rec)).toEqual({ title: "Ray's new primary arithmetic for young learners", author: 'Ray, Joseph, 1807-1855', year: 1877, publicDomain: true });
    expect(parseScanRecord(rec.replace('"1877"', '"1931-05-01"')).publicDomain).toBe(false);
    expect(parseScanRecord(rec.replace('NOT_IN_COPYRIGHT', 'UNKNOWN')).publicDomain).toBe(false);
    expect(parseScanRecord(rec.replace('"date":"1877",', '')).publicDomain).toBe(false);
    expect(parseScanRecord('not json')).toEqual({ title: undefined, author: undefined, year: undefined, publicDomain: false });
  });

  it('links pasted contents to the scan, offset to where printed page 1 is', () => {
    const { units } = parseOutline('Chapter 1 .... 1\n  Counting .... 3\n  Adding .... 9\nChapter 2 .... 15\n  Has a link https://example.org/x .... 16');
    const byPage = linkScanPages(units, 'rays', 7);
    expect(byPage.flatMap((u) => u.lessons.map((l) => l.links[0]))).toEqual([
      { label: 'Read p. 3', url: 'https://archive.org/details/rays/page/n9/mode/1up' },
      { label: 'Read p. 9', url: 'https://archive.org/details/rays/page/n15/mode/1up' },
      { label: 'Open lesson', url: 'https://example.org/x' },
    ]);
    expect(linkScanPages(units, 'rays')[0].lessons[0].links[0].url).toBe('https://archive.org/details/rays/page/3/mode/1up');
    // Lessons without pages stay unlinked.
    expect(linkScanPages(parseOutline('Unit 1\nNo pages').units, 'rays')[0].lessons[0].links).toEqual([]);
  });
});

describe('YouTube', () => {
  const page = 'https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF';
  const data = (videos: { id: string; title: string }[]) =>
    `<script>var ytInitialData = ${JSON.stringify({ contents: videos.map((v) => ({ playlistVideoRenderer: { videoId: v.id, title: { runs: [{ text: v.title }] } } })), header: { playlistMetadataRenderer: { title: 'My list' } }, owner: { videoOwnerRenderer: { title: { simpleText: 'Teacher Tube' } } } })};</script>`;

  it('finds the playlist on every YouTube host, and only for real list ids', () => {
    for (const u of ['https://m.youtube.com/playlist?list=PL3EED4C1D684D3ADF', 'https://music.youtube.com/playlist?list=PL3EED4C1D684D3ADF', 'https://youtu.be/abc?list=PL3EED4C1D684D3ADF', 'https://www.youtube.com/watch?v=abc&list=PL3EED4C1D684D3ADF&index=3']) {
      expect(playlistId(new URL(u)), u).toBe('PL3EED4C1D684D3ADF');
    }
    expect(playlistId(new URL('https://www.youtube.com/watch?v=abc'))).toBeUndefined();
    expect(playlistId(new URL('https://www.youtube.com/playlist?list=short'))).toBeUndefined();
    expect(playlistId(new URL('https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF%22%3E'))).toBeUndefined();
    expect(playlistId(new URL('https://notyoutube.com/playlist?list=PL3EED4C1D684D3ADF'))).toBeUndefined();
  });

  it('skips private, deleted and repeated videos, and splits long playlists evenly', () => {
    const videos = [
      ...Array.from({ length: 11 }, (_, i) => ({ id: `vid${i}`, title: `Episode ${i + 1}` })),
      { id: 'vid0', title: 'Episode 1 again' },
      { id: 'p', title: '[Private video]' },
      { id: 'd', title: '[Deleted video]' },
    ];
    const r = parseYouTubePlaylist(data(videos), page);
    expect(r.units.map((u) => [u.title, u.lessons.length])).toEqual([
      ['Videos 1–6', 6],
      ['Videos 7–11', 5],
    ]);
    expect(r.units[0].lessons[0].links[0]).toEqual({ label: 'Watch', url: 'https://www.youtube.com/watch?v=vid0&list=PL3EED4C1D684D3ADF' });
    expect(r).toMatchObject({ title: 'My list', author: 'Teacher Tube' });
    expect(r.warnings.join(' ')).toMatch(/check their license/);
  });

  it('warns that only the first 100 videos are shown', () => {
    const r = parseYouTubePlaylist(data(Array.from({ length: 100 }, (_, i) => ({ id: `v${i}`, title: `V ${i}` }))), page);
    expect(r.warnings[0]).toMatch(/first 100 videos/);
    expect(lessonTotal(r.units)).toBe(100);
  });

  it('a playlist page is never read as a generic page, and has no license of its own', () => {
    const r = parseWebPage(`<title>My list - YouTube</title>${data([{ id: 'a', title: 'One' }])}<a rel="license" href="https://creativecommons.org/licenses/by/4.0/">CC</a>`, page);
    expect(r.format).toBe('playlist');
    expect(r.license).toBeUndefined();
    expect(sourceAddress('https://www.youtube.com/watch?v=abc&list=PL3EED4C1D684D3ADF')).toEqual({ kind: 'playlist', fetchUrl: 'https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF' });
  });
});

describe('Pressbooks', () => {
  const toc = (items: string, extra = '') =>
    `<meta name="generator" content="Pressbooks 6.0">${extra}<ol class="toc">${items}</ol>`;
  const chapter = (n: number) => `<li class="toc__chapter"><a href="/book/chapter/c${n}/">Chapter ${n}</a></li>`;

  it('skips front and back matter, keeps chapters outside parts together', () => {
    const r = parsePressbooks(toc(`<li class="toc__front-matter"><a href="/book/front-matter/intro/">Introduction</a></li>${chapter(1)}${chapter(2)}<li class="toc__part"><a href="/book/part/p1/">Part I</a><ol><li class="toc__chapter"><a href="/book/chapter/p1c1/">Inside</a></li></ol></li><li class="toc__back-matter"><a href="/book/back-matter/glossary/">Glossary</a></li>`), 'https://press.example.org/book/')!;
    expect(outline(r)).toEqual([
      ['Chapters', ['Chapter 1', 'Chapter 2']],
      ['Part I', ['Inside']],
    ]);
  });

  it('splits a long book with no parts into units of about ten', () => {
    const r = parsePressbooks(toc(Array.from({ length: 13 }, (_, i) => chapter(i + 1)).join('')), 'https://press.example.org/book/')!;
    expect(r.units.map((u) => [u.title, u.lessons.length])).toEqual([
      ['Chapters 1–7', 7],
      ['Chapters 8–13', 6],
    ]);
  });

  it('takes the book’s license statement (not an image credit) and notes chapters can differ', () => {
    const r = parsePressbooks(toc(chapter(1), '<img src="x.png"><a href="https://creativecommons.org/licenses/by/4.0/">image CC BY</a><div class="license-attribution">This book is licensed under a <a href="https://creativecommons.org/licenses/by-nc/4.0/">Creative Commons Attribution-NonCommercial 4.0</a> License.</div>'), 'https://press.example.org/book/')!;
    expect(r.license?.kind).toBe('cc_by_nc');
    expect(r.warnings[0]).toMatch(/chapters can carry their own licenses/);
  });

  it('is not used for other pages, or Pressbooks pages without a table of contents', () => {
    expect(parsePressbooks('<ol class="toc"><li class="toc__chapter"><a href="/a">A</a></li></ol>'.replace('toc__chapter', 'chapter'), 'https://x.example.org/')).toBeUndefined();
    expect(parsePressbooks('<meta name="generator" content="Pressbooks">', 'https://x.example.org/')).toBeUndefined();
  });

  it('a chapter page loads its book’s contents, keeping the first page if that fails', async () => {
    const first = { ...parseWebPage('<meta name="generator" content="Pressbooks 6"><h1>Chapter 3</h1>', 'https://press.example.org/biology/chapter/cells/'), url: 'https://press.example.org/biology/chapter/cells/' };
    expect(first.next).toEqual({ url: 'https://press.example.org/biology/', kind: 'page', auto: true, label: 'the book’s table of contents' });
    const failed = await followNext(first, async () => {
      throw new Error('offline');
    });
    expect(failed.url).toBe(first.url);
    expect(failed.warnings[0]).toMatch(/Couldn’t load the book’s table of contents/);
    const loaded = await followNext(first, async (u) => ({ url: u, html: toc(chapter(1) + chapter(2)) }));
    expect(loaded.url).toBe('https://press.example.org/biology/');
    expect(lessonTotal(loaded.units)).toBe(2);
  });
});

describe('LibreTexts', () => {
  it('reads nothing from a broken outline', () => {
    expect(parseLibreTexts('{nope')).toEqual({ units: [], warnings: [] });
    expect(parseLibreTexts('{"toc":{"title":"Empty","children":[]}}')).toEqual({ units: [], warnings: [] });
  });

  it('orders sections numerically (1.2 before 1.10) with exercises last; front matter is skipped', () => {
    const toc = { toc: { title: 'Book', children: [
      { title: 'Front Matter', children: [{ title: 'TitlePage' }] },
      { title: '1: Numbers', children: [{ title: '1.10: Ten' }, { title: '1.E: Exercises' }, { title: '1.2: Two' }, { title: '1.1: One' }] },
      { title: '2: Shapes', children: [{ title: '2.1: Circles', url: 'https://math.libretexts.org/2.1' }] },
    ] } };
    const r = parseLibreTexts(JSON.stringify(toc));
    expect(outline(r)).toEqual([
      ['1: Numbers', ['1.1: One', '1.2: Two', '1.10: Ten', '1.E: Exercises']],
      ['2: Shapes', ['2.1: Circles']],
    ]);
    expect(r.units[1].lessons[0].links).toEqual([{ label: 'Read', url: 'https://math.libretexts.org/2.1' }]);
    expect(r.license).toBeUndefined();
  });

  it('spells out mixed licenses and pages with no license, and special restrictions', () => {
    const doc = { data: { meta: { mostRestrictiveLicense: { label: 'CC BY-NC-SA', raw: 'ccbyncsa', version: '4.0', link: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }, licenses: [{ label: 'CC BY', raw: 'ccby', count: 3 }, { label: 'Undeclared', raw: 'notset', count: 1 }, { label: 'CC BY-NC-SA', raw: 'ccbyncsa', count: 2 }], specialRestrictions: ['noncommercial'] }, text: { title: 'Book', children: [{ title: 'Only page' }] } } };
    const r = parseLibreTexts(JSON.stringify(doc));
    expect(r.license).toEqual({ kind: 'cc_by_nc_sa', version: '4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' });
    expect(r.warnings[0]).toBe('This book’s pages use different licenses: CC BY (3 pages), no license stated (1 page), CC BY-NC-SA (2 pages). Your plan uses the most restrictive one; check the book’s “Detailed Licensing” page before publishing.');
    expect(r.warnings[1]).toMatch(/extra restrictions \(noncommercial\)/);
    // Pages without chapters land in a unit named for the book.
    expect(outline(r)).toEqual([['Book', ['Only page']]]);
  });

  it('asks the creator to choose when the license is one it doesn’t know', () => {
    const r = parseLibreTexts(JSON.stringify({ data: { meta: { mostRestrictiveLicense: { label: 'Gnu Free Documentation License', raw: 'gnufdl' } }, text: { title: 'B', children: [{ title: 'P' }] } } }));
    expect(r.license).toBeUndefined();
    expect(r.warnings).toEqual(['LibreTexts lists this book as “Gnu Free Documentation License”. Check its terms and choose its license below.']);
  });

  it('only books on a library subdomain point to an outline (not the commons site)', () => {
    const html = '<script>var x = {"pageId": 12345};</script>';
    expect(parseWebPage(html, 'https://math.libretexts.org/Bookshelves/Book').next?.url).toBe('https://commons.libretexts.org/api/v1/commons/book/math-12345/licensereport');
    expect(parseWebPage(html, 'https://commons.libretexts.org/book/x').next).toBeUndefined();
    expect(parseWebPage(html, 'https://evil-libretexts.org/x').next).toBeUndefined();
  });

  it('keeps the book page’s result when its outline is empty', async () => {
    const first: WebImport & { url: string } = { units: [], warnings: [], title: 'Book', format: 'textbook', url: 'https://math.libretexts.org/b', next: { url: 'https://commons.libretexts.org/x', kind: 'libretexts', auto: true, label: 'the book’s outline from LibreTexts' } };
    const r = await followNext(first, async (u) => ({ url: u, html: '{"toc":{"children":[]}}' }));
    expect(r.units).toEqual([]);
    expect(r.warnings[0]).toMatch(/Couldn’t load the book’s outline from LibreTexts/);
    // Pages that don't need a second load come back as they are.
    const plain = { ...first, next: undefined };
    expect(await followNext(plain, async () => ({ url: '', html: '' }))).toBe(plain);
  });
});

describe('Wikibooks', () => {
  it('offers the print version without loading it on its own', () => {
    const r = parseWebPage(fixture('wikibooks-main.html'), 'https://en.wikibooks.org/wiki/Arithmetic');
    expect(r.next).toMatchObject({ kind: 'page', auto: false });
    expect(r.format).toBe('textbook');
    expect(r.warnings.join(' ')).not.toMatch(/Some sections without lessons/);
  });

  it('a wiki heading’s [edit] link is never part of the unit name', () => {
    const html = '<div class="mw-parser-output"><h2>Fractions [ edit | edit source ]</h2><ul><li><a href="/wiki/Book/Fractions/Halves">Book/Fractions/Halves</a></li><li><a href="/wiki/Book/Fractions/Thirds">Thirds</a></li><li><a href="/wiki/Book/Fractions/Fourths">Fourths</a></li></ul></div>';
    const r = parseWebPage(html, 'https://en.wikibooks.org/wiki/Book');
    expect(r.units[0].title).toBe('Fractions');
    expect(r.units[0].lessons.map((l) => l.title)).toContain('Halves');
  });
});

describe('schema.org JSON-LD', () => {
  const r = parseWebPage(fixture('jsonld-course.html'), 'https://sky.example.org/weather');

  it('reads a Course’s parts as units, ignoring the breadcrumbs', () => {
    expect(outline(r)).toEqual([
      ['Clouds', ['Cloud types', 'Make a cloud in a jar']],
      ['Wind', ['Build a wind vane']],
      ['Intro to Weather', ['Weather journal']],
    ]);
    expect(links(r)[1]).toBe('https://sky.example.org/clouds/jar');
    expect(r).toMatchObject({ title: 'Intro to Weather', author: 'Ana Ruiz, Ben Ode' });
  });

  it('reads a license written as a short name ("CC BY-NC-SA 4.0") with every condition', () => {
    expect(r.license).toMatchObject({ kind: 'cc_by_nc_sa', version: '4.0' });
    expect(licenseFrom({ name: 'CC BY 4.0' })).toMatchObject({ kind: 'cc_by', version: '4.0' });
    expect(licenseFrom({ name: 'CC BY-ND 4.0' })).toMatchObject({ kind: 'cc_by_nd' });
    expect(licenseFrom({ name: 'cc-by-sa' })).toMatchObject({ kind: 'cc_by_sa' });
    expect(licenseFrom({ name: 'CC BY-NC-ND 3.0' })).toMatchObject({ kind: 'cc_by_nc_nd', version: '3.0' });
    expect(licenseFrom('https://creativecommons.org/licenses/by-sa/3.0/')).toMatchObject({ kind: 'cc_by_sa', version: '3.0' });
    expect(licenseFrom(['https://creativecommons.org/publicdomain/zero/1.0/'])).toMatchObject({ kind: 'cc0' });
    expect(licenseFrom({ name: 'All rights reserved' })).toBeUndefined();
    expect(licenseFrom(42)).toBeUndefined();
  });

  it('lists at most three authors', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Book', name: 'B', author: ['A', 'B', 'C', { name: 'D' }] })}</script>`;
    expect(jsonLdInfo(html).author).toBe('A, B, C, and others');
  });

  it('ItemList positions decide the order; fewer than three lessons isn’t an outline', () => {
    const list = (n: number) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: Array.from({ length: n }, (_, i) => ({ '@type': 'ListItem', position: n - i, item: { name: `Step ${n - i}`, url: `https://x.example.org/${n - i}` } })) })}</script>`;
    expect(outline(parseJsonLdOutline(list(3), 'https://x.example.org/')!)).toEqual([['Lessons', ['Step 1', 'Step 2', 'Step 3']]]);
    expect(parseJsonLdOutline(list(2), 'https://x.example.org/')).toBeUndefined();
    expect(parseJsonLdOutline('<script type="application/ld+json">{broken</script>', 'https://x.example.org/')).toBeUndefined();
  });
});

describe('nested lists', () => {
  const r = parseWebPage(fixture('nested-outline.html'), 'https://hist.example.org/outline');

  it('outer items are units, inner items lessons; menus and footers are skipped', () => {
    expect(outline(r)).toEqual([
      ['Egypt', ['The gift of the Nile', 'Building the pyramids', 'Mummies (library book)']],
      ['Greece', ['City-states', 'The first Olympics']],
      ['Rome', ['All roads lead to Rome']],
    ]);
  });

  it('a link followed by a long description is named by the link', () => {
    expect(r.units[1].lessons[0].links[0].url).toBe('https://hist.example.org/history/greece/city-states');
  });

  it('warns that no license was found', () => {
    expect(r.license).toBeUndefined();
    expect(r.warnings).toContain('No license found on that page. Check the source’s terms and choose its license before publishing.');
  });
});

describe('pages built by scripts', () => {
  it('explain how to copy the outline instead of finding nothing', () => {
    const r = parseWebPage(fixture('script-built.html'), 'https://app.example.org/course/1');
    expect(r.units).toEqual([]);
    expect(r.warnings[0]).toMatch(/builds its pages with scripts/);
  });

  it('a plain page with no lessons says to paste the outline', () => {
    const r = parseWebPage('<html><body><p>Welcome to our homeschool blog.</p></body></html>', 'https://blog.example.org/');
    expect(r.warnings[0]).toMatch(/Couldn’t find a list of lessons/);
  });
});

describe('helpers', () => {
  it('chunkUnits makes even units and handles nothing', () => {
    expect(chunkUnits([])).toEqual([]);
    const lessons = Array.from({ length: 21 }, (_, i) => ({ id: `${i}`, title: `${i}`, steps: [], links: [], questions: [] }));
    expect(chunkUnits(lessons).map((u) => u.lessons.length)).toEqual([7, 7, 7]);
    expect(chunkUnits(lessons.slice(0, 4))[0].title).toBe('Lessons');
  });
});
