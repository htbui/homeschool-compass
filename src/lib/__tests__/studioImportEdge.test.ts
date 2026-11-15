import { describe, expect, it } from 'vitest';

import { decode, textOf } from '../html';
import { parseOutline, parseTable, splitRows } from '../importers';
import { allLessons, newPackage, type PackageUnit } from '../package';
import { csvCell, planCsv, planFileName, planHtml } from '../planExport';

// Studio & Community: table-of-contents and spreadsheet import edge cases,
// and the CSV export → import round trip.

const titles = (units: PackageUnit[]) => units.map((u) => [u.title, u.lessons.map((l) => l.title)]);
const strip = (u: PackageUnit[]) => JSON.parse(JSON.stringify(u.map((x) => ({ title: x.title, lessons: x.lessons.map(({ id: _id, ...l }) => l) }))));

describe('table of contents: what becomes a unit', () => {
  it('treats every unit word as a unit (part, module, week, term…), case-insensitively', () => {
    const { units } = parseOutline('PART ONE\nIntro\nModule 2: Cells\nNucleus\nWeek 3\nReview\nsemester two\nFinal');
    expect(titles(units)).toEqual([
      ['PART ONE', ['Intro']],
      ['Module 2: Cells', ['Nucleus']],
      ['Week 3', ['Review']],
      ['semester two', ['Final']],
    ]);
  });

  it('reads markdown headings (# and ##) as units, ### as lessons', () => {
    const { units, warnings } = parseOutline('# Plants\n### Roots\n- Stems\n## Animals\n* Mammals');
    expect(titles(units)).toEqual([
      ['Plants', ['Roots', 'Stems']],
      ['Animals', ['Mammals']],
    ]);
    expect(warnings).toEqual([]);
  });

  it('never makes a sub-numbered entry ("1.2 …") a unit, even when it starts with a unit word', () => {
    const { units } = parseOutline('Chapter 1 Numbers\n1.1 Unit fractions\n1.2 Part-whole models');
    expect(titles(units)).toEqual([['Chapter 1 Numbers', ['1.1 Unit fractions', '1.2 Part-whole models']]]);
  });

  it('puts lessons before the first unit in their own unit', () => {
    const { units } = parseOutline('Welcome\nUnit 1\nFirst lesson');
    expect(titles(units)).toEqual([
      ['Lessons', ['Welcome']],
      ['Unit 1', ['First lesson']],
    ]);
  });

  it('uses tabs as indentation (a tab counts as four spaces)', () => {
    const { units } = parseOutline('Rocks\n\tMinerals\n\tCrystals\nWater\n\tRivers');
    expect(titles(units)).toEqual([
      ['Rocks', ['Minerals', 'Crystals']],
      ['Water', ['Rivers']],
    ]);
  });

  it('a flat list with no unit words is one unit and says so', () => {
    const { units, warnings } = parseOutline('Adding\nSubtracting\nMultiplying');
    expect(titles(units)).toEqual([['Lessons', ['Adding', 'Subtracting', 'Multiplying']]]);
    expect(warnings.join(' ')).toMatch(/No units or chapters found/);
  });

  it('ignores blank lines, bare bullets and dot leaders with nothing in front', () => {
    expect(parseOutline('\n\n   \n').warnings[0]).toMatch(/Nothing to import/);
    const { units } = parseOutline('Unit 1\n-\n•   \n.....\nReal lesson');
    expect(titles(units)).toEqual([['Unit 1', ['Real lesson']]]);
  });

  it('handles Windows line endings', () => {
    const { units } = parseOutline('Unit 1\r\nOne\r\nTwo\r\n');
    expect(titles(units)).toEqual([['Unit 1', ['One', 'Two']]]);
  });
});

describe('table of contents: pages', () => {
  it('reads start pages after dot leaders, middle dots, ellipses, tabs and wide spacing', () => {
    const { units } = parseOutline('Chapter 1 ..... 1\nPlace value ··· 2\nRounding … 9\nEstimating\t14\nChapter 2  20\nFractions   21', { lastPage: 30 });
    const pages = allLessons(units).map((l) => [l.title, l.pages]);
    expect(pages).toEqual([
      ['Place value', '2–8'],
      ['Rounding', '9–13'],
      ['Estimating', '14–19'],
      ['Fractions', '21–30'],
    ]);
  });

  it('keeps label numbers in titles: "Lesson 5", "Grade 3", "Day 12"', () => {
    const { units } = parseOutline('Unit 1\nLesson 5\nGrade 3\nDay 12\nPage 4');
    expect(allLessons(units).map((l) => [l.title, l.pages])).toEqual([
      ['Lesson 5', undefined],
      ['Grade 3', undefined],
      ['Day 12', undefined],
      ['Page 4', undefined],
    ]);
  });

  it('a one-word title with a trailing number is not read as a page ("Apollo 11")', () => {
    const { units } = parseOutline('Unit 1\nApollo 11\nThe Apollo missions 11');
    expect(allLessons(units).map((l) => [l.title, l.pages])).toEqual([
      ['Apollo 11', undefined],
      ['The Apollo missions', '11+'],
    ]);
  });

  it('the last lesson runs to the last page, or is open-ended without one', () => {
    expect(allLessons(parseOutline('Unit 1\nA .... 3\nB .... 7').units).map((l) => l.pages)).toEqual(['3–6', '7+']);
    expect(allLessons(parseOutline('Unit 1\nA .... 3\nB .... 7', { lastPage: 7 }).units).map((l) => l.pages)).toEqual(['3–6', '7']);
  });

  it('written ranges win over computed ones, in any dash style', () => {
    const { units } = parseOutline('Unit 1\nRead pp. 12—18\nRead pages 4 - 9\nRead p.30–31 .... 30');
    expect(allLessons(units).map((l) => l.pages)).toEqual(['12–18', '4–9', '30–31']);
  });

  it('splits a chapter-only book into even page chunks, and the last chunk ends on the last page', () => {
    const { units, warnings } = parseOutline('Chapter 1 .... 1\nChapter 2 .... 11\nChapter 3 .... 15', { pagesPerLesson: 5, lastPage: 24 });
    expect(allLessons(units).map((l) => [l.title, l.pages])).toEqual([
      ['Chapter 1 (1 of 2)', '1–5'],
      ['Chapter 1 (2 of 2)', '6–10'],
      ['Chapter 2', '11–14'],
      ['Chapter 3 (1 of 2)', '15–19'],
      ['Chapter 3 (2 of 2)', '20–24'],
    ]);
    expect(warnings).toEqual([]);
  });

  it('chapter-only contents without pages become one lesson per chapter, with a warning', () => {
    const { units, warnings } = parseOutline('Chapter 1 .... 1\nChapter 2 .... 9');
    expect(allLessons(units).map((l) => [l.title, l.pages])).toEqual([
      ['Chapter 1', '1–8'],
      ['Chapter 2', '9+'],
    ]);
    expect(warnings[0]).toMatch(/2 chapters had no lessons/);
  });

  it('keeps a lesson link pasted with the line, trimming punctuation after it', () => {
    const { units } = parseOutline('Unit 1\nVideo: https://example.org/v/1.\n- https://example.org/only-a-link');
    expect(allLessons(units).map((l) => [l.title, l.links])).toEqual([
      ['Video', [{ label: 'Open lesson', url: 'https://example.org/v/1' }]],
      ['https://example.org/only-a-link', [{ label: 'Open lesson', url: 'https://example.org/only-a-link' }]],
    ]);
  });
});

describe('spreadsheet import', () => {
  it('reads tab-separated rows pasted from Sheets/Excel', () => {
    const { units, warnings } = parseTable('Unit\tLesson\tMinutes\nSoil\tLayers\t25\nSoil\tWorms\t40');
    expect(warnings).toEqual([]);
    expect(titles(units)).toEqual([['Soil', ['Layers', 'Worms']]]);
    expect(allLessons(units).map((l) => l.minutes)).toEqual([25, 40]);
  });

  it('keeps a lesson under the last unit when its unit cell is blank', () => {
    const { units } = parseTable('Unit,Lesson\nSoil,Layers\n,Worms\nWater,Rain');
    expect(titles(units)).toEqual([
      ['Soil', ['Layers', 'Worms']],
      ['Water', ['Rain']],
    ]);
  });

  it('only accepts sensible minutes (1–480, rounded)', () => {
    const { units } = parseTable('Lesson,Minutes\nA,0\nB,-5\nC,481\nD,abc\nE,22.6\nF,');
    expect(allLessons(units).map((l) => l.minutes)).toEqual([undefined, undefined, undefined, undefined, 23, undefined]);
  });

  it('skips rows without a lesson title', () => {
    const { units } = parseTable('Unit,Lesson,Pages\nSoil,,4\nSoil,Worms,5');
    expect(allLessons(units).map((l) => l.title)).toEqual(['Worms']);
  });

  it('says so when the rows hold no lessons', () => {
    expect(parseTable('Unit,Lesson\nSoil,').warnings).toContain('No lessons found in those rows.');
    expect(parseTable('').warnings[0]).toMatch(/Nothing to import/);
  });

  it('cleans up pages ("pp. 4-9" → "4–9")', () => {
    const { units } = parseTable('Lesson,Pages\nA,pp. 4-9\nB,p.12\nC,30');
    expect(allLessons(units).map((l) => l.pages)).toEqual(['4–9', '12', '30']);
  });

  it('reads labelled links, several per cell, and drops cells without an address', () => {
    const { units } = parseTable('Lesson,Link\nA,"Video: https://example.org/v\nWorksheet – https://example.org/w.pdf"\nB,see the book\nC,https://example.org/c;https://example.org/d');
    expect(allLessons(units).map((l) => l.links)).toEqual([
      [{ label: 'Video', url: 'https://example.org/v' }, { label: 'Worksheet', url: 'https://example.org/w.pdf' }],
      [],
      [{ label: 'Open lesson', url: 'https://example.org/c' }, { label: 'Open lesson', url: 'https://example.org/d' }],
    ]);
  });

  it('keeps blank answers in place ("-") so they line up with their questions', () => {
    const { units } = parseTable('Lesson,Questions,Answers\nA,"Q1\nQ2\nQ3","-\n4\n-"\nB,Q1;Q2,-;-');
    const [a, b] = allLessons(units);
    expect(a.questions).toEqual(['Q1', 'Q2', 'Q3']);
    expect(a.answers).toEqual(['', '4']);
    expect(b.answers).toBeUndefined();
  });

  it('maps level and theme columns to lesson versions', () => {
    const csv = 'Lesson,Steps,Easy steps,Challenge questions,Challenge answers,Theme: Space steps,Space questions,Student questions\nOrbits,Read,Look at a picture,Why do planets orbit?,Gravity,Draw a rocket,How far is the moon?,What is an orbit?';
    const [l] = allLessons(parseTable(csv).units);
    expect(l.steps).toEqual(['Read']);
    // "Student questions" are the main lesson's questions, not a theme called "Student".
    expect(l.questions).toEqual(['What is an orbit?']);
    expect(l.versions).toEqual({ easier: { steps: ['Look at a picture'], questions: [] }, harder: { steps: [], questions: ['Why do planets orbit?'], answers: ['Gravity'] } });
    expect(l.themes).toEqual([{ theme: 'Space', steps: ['Draw a rocket'], questions: ['How far is the moon?'] }]);
  });

  it('reads standards, deduped, from a Standards column', () => {
    const [l] = allLessons(parseTable('Lesson,Standards\nFractions,"CCSS.MATH.CONTENT.3.NF; 3.nf.a.1, ccss.math.content.3.nf"').units);
    expect(l.standards).toEqual(['CCSS.MATH.CONTENT.3.NF', '3.nf.a.1']);
  });

  it('ignores unknown columns, and uses the first of two matching ones', () => {
    const [l] = allLessons(parseTable('Lesson,Color,Title\nReal title,blue,Other').units);
    expect(l.title).toBe('Real title');
  });

  it('without a header, uses a numeric second column as pages only when every row has one', () => {
    expect(allLessons(parseTable('Seeds,4-9\nSoil,10').units).map((l) => l.pages)).toEqual(['4–9', '10']);
    expect(allLessons(parseTable('Seeds,4-9\nSoil,muddy').units).map((l) => l.pages)).toEqual([undefined, undefined]);
  });

  it('splits rows honoring quotes, escaped quotes, line breaks in cells, and CRLF', () => {
    expect(splitRows('a,"b ""c"", d","e\nf"\r\ng,h\r\n')).toEqual([
      ['a', 'b "c", d', 'e\nf'],
      ['g', 'h'],
    ]);
    // Rows that are all blank are dropped; a missing last newline is fine.
    expect(splitRows('a,b\n,\n\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('CSV export → import round trip', () => {
  const lesson = (id: string, title: string, p: Partial<PackageUnit['lessons'][number]> = {}) => ({ id, title, steps: [], links: [], questions: [], ...p });

  it('keeps a single step or question that contains a semicolon or a bar in one piece', () => {
    const units: PackageUnit[] = [
      {
        id: 'u',
        title: 'Planets',
        lessons: [
          lesson('a', 'Orbits', { steps: ['Read pages 1; then 2'], questions: ['Mercury | Venus: which is hotter?'], answers: ['Venus; it has clouds'] }),
          lesson('b', 'Moons', { steps: ['One', 'Two; three'], questions: ['Q'] }),
        ],
      },
    ];
    const back = parseTable(planCsv({ units }));
    expect(back.warnings).toEqual([]);
    expect(strip(back.units)).toEqual(strip(units));
  });

  it('round-trips formulas, quotes, commas, tabs, leading spaces and line breaks in notes', () => {
    const units: PackageUnit[] = [
      {
        id: 'u',
        title: '=Unit, "one"',
        lessons: [lesson('a', '+1 more', { notes: 'Line 1\nLine "2", with comma', questions: ['@home?'], pages: '4–9', minutes: 20 })],
      },
    ];
    const back = parseTable(planCsv({ units }));
    expect(strip(back.units)).toEqual(strip(units));
    expect(csvCell('a\tb')).toBe('a b');
    expect(csvCell(' lead')).toBe('" lead"');
    expect(csvCell(5)).toBe('5');
    expect(csvCell(undefined)).toBe('');
  });

  it('always has a header row even for an empty plan, and imports back as nothing', () => {
    const csv = planCsv({ units: [] });
    expect(csv).toBe('Unit,Lesson,Pages,Minutes,Link,Steps,Questions,Answers,Notes\n');
    expect(parseTable(csv).units).toEqual([]);
  });

  it('makes safe file names', () => {
    expect(planFileName({ title: 'Space Math: Orbits & Rockets!' }, 'csv')).toBe('Space-Math-Orbits-Rockets.csv');
    expect(planFileName({ title: '   ' }, 'pdf')).toBe('lesson-plan.pdf');
    expect(planFileName({ title: '../../etc/passwd' }, 'csv')).toBe('etcpasswd.csv');
    expect(planFileName({ title: 'x'.repeat(100) }, 'csv')).toHaveLength(64);
  });

  it('escapes the teacher’s guide (no HTML from lesson text runs)', () => {
    const pkg = newPackage({ title: '<script>alert(1)</script>', units: [{ id: 'u', title: '<b>Unit</b>', lessons: [lesson('a', '<img src=x onerror=alert(1)>', { notes: '<i>n</i>' })] }] });
    const html = planHtml(pkg, '<Creator>');
    expect(html).not.toMatch(/<script>alert|<img src=x|<b>Unit|<i>n<\/i>|<Creator>/);
    expect(html).toContain('&lt;script&gt;');
    expect(planHtml(newPackage({ title: '' }))).toContain('No lessons yet.');
  });
});

describe('reading page text', () => {
  it('decodes entities once (an escaped entity stays escaped)', () => {
    expect(decode('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decode('Use &amp;lt;b&amp;gt; for bold')).toBe('Use &lt;b&gt; for bold');
    expect(decode('&#8220;Hi&#8221; &#x2014; ok')).toBe('“Hi” — ok');
  });

  it('decodes characters outside the basic plane (emoji)', () => {
    expect(decode('Frogs &#128056; and &#x1F98B;')).toBe('Frogs 🐸 and 🦋');
  });

  it('collapses whitespace and drops tags', () => {
    expect(textOf('<p>One\n   <b>two</b></p>&nbsp;three')).toBe('One two three');
  });
});
