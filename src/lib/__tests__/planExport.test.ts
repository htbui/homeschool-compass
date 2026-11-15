import { describe, expect, it } from 'vitest';

import { parseTable, splitRows } from '../importers';
import { newPackage, type PackageUnit } from '../package';
import { csvCell, planCsv, planFileName, planHtml } from '../planExport';

const units: PackageUnit[] = [
  {
    id: 'u1',
    title: 'Fractions, part 1',
    lessons: [
      {
        id: 'a',
        title: 'Halves "and" wholes',
        minutes: 25,
        pages: '4–9',
        steps: ['Fold a paper', 'Shade, then cut'],
        links: [{ label: 'Video', url: 'https://example.org/halves' }, { label: 'Open lesson', url: 'https://example.org/b' }],
        questions: ['Half of 4?', 'Half of 7?', 'Half of 10?'],
        answers: ['2', '', '5'],
        notes: 'Use counters.\nGo slow.',
        standards: ['CCSS.MATH.CONTENT.3.NF', 'TEKS 3.3A'],
        versions: { easier: { steps: ['Fold only'], questions: [] }, harder: { steps: [], questions: ['Half of 13?'], answers: ['6.5'] } },
        themes: [{ theme: 'Dinosaurs', steps: ['Share dino snacks in half'], questions: [] }],
      },
      { id: 'b', title: 'Quarters', steps: [], links: [], questions: [] },
    ],
  },
  { id: 'u2', title: 'Review', lessons: [{ id: 'c', title: 'Pizza day', steps: ['Cut the pizza'], links: [], questions: [] }] },
];
const strip = (u: PackageUnit[]) => JSON.parse(JSON.stringify(u.map((x) => ({ title: x.title, lessons: x.lessons.map(({ id: _id, ...l }) => l) }))));

describe('plan export', () => {
  it('round-trips through the spreadsheet importer', () => {
    const csv = planCsv({ units });
    expect(splitRows(csv)[0]).toEqual(['Unit', 'Lesson', 'Pages', 'Minutes', 'Link', 'Steps', 'Questions', 'Answers', 'Notes', 'Standards', 'Easier steps', 'Easier questions', 'Easier answers', 'Harder steps', 'Harder questions', 'Harder answers', 'Dinosaurs steps', 'Dinosaurs questions', 'Dinosaurs answers']);
    const back = parseTable(csv);
    expect(back.warnings).toEqual([]);
    expect(strip(back.units)).toEqual(strip(units));
  });

  it('keeps a plain plan to the usual columns', () => {
    const csv = planCsv({ units: [units[1]] });
    expect(csv.split('\n')[0]).toBe('Unit,Lesson,Pages,Minutes,Link,Steps,Questions,Answers,Notes');
    expect(csv.split('\n')[1]).toBe('Review,Pizza day,,,,Cut the pizza,,,');
  });

  it('quotes cells safely', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('tab\there')).toBe('tab here');
    expect(csvCell(12)).toBe('12');
    expect(planFileName({ title: 'Space Math: Year 1!' }, 'csv')).toBe('Space-Math-Year-1.csv');
    expect(planFileName({ title: '  ' }, 'pdf')).toBe('lesson-plan.pdf');
  });

  it('prints a teacher’s guide with every lesson, version, and answer', () => {
    const html = planHtml(newPackage({ title: 'Fractions <Fun>', units, subjects: ['math'], attribution: '© Maple' }), 'Maple Room');
    expect(html).toContain('Fractions &lt;Fun&gt;');
    expect(html).toContain('By Maple Room');
    expect(html).toContain('3. Pizza day');
    expect(html).toContain('🌱 Easier version');
    expect(html).toContain('🎨 Dinosaurs version');
    expect(html).toContain('→ 6.5');
    expect(html).toContain('Math 3.NF · Fractions');
    expect(html).toContain('© Maple');
  });
});
