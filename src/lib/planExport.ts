import { esc } from './documents';
import { GRADE_LABELS } from './market';
import { allLessons, LEVEL_LABEL, lessonTotal, planLevels, planThemes, type CurriculumPackage, type LessonVersion, type PackageLesson } from './package';
import { standardLabel } from './standards';
import { subjectLabel } from './subjects';

/**
 * A Studio plan as a spreadsheet (CSV) or a printable teacher's guide (PDF).
 * The CSV uses the columns the spreadsheet importer reads, so exporting and
 * importing again gives back the same lessons.
 */

/**
 * One item per line. The importer splits a one-line cell on ";" and "|", so a
 * single item holding one of those ends with a line break to stay whole.
 */
const lines = (list?: string[]) => {
  const all = list ?? [];
  return all.join('\n') + (all.length === 1 && /[;|]/.test(all[0]) ? '\n' : '');
};
/** Blank answers keep their place as "-" (the importer reads that as blank). */
const answerLines = (list?: string[]) => lines((list ?? []).map((a) => a || '-'));

/**
 * One CSV cell: quoted when it has a comma, quote, or line break. Tabs become spaces (the importer treats a tab as TSV).
 * Text starting with = + @ gets a leading ' so spreadsheets don't run it as a formula (the importer drops it again).
 */
export function csvCell(v: string | number | undefined): string {
  const raw = v === undefined ? '' : String(v).replace(/\t/g, ' ').replace(/\r\n?/g, '\n');
  const s = typeof v === 'string' && /^[=+@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Col = { header: string; cell: (l: PackageLesson, unit: string) => string | number | undefined };

export function planCsv(pkg: Pick<CurriculumPackage, 'units'>): string {
  const versionCols = (header: string, get: (l: PackageLesson) => LessonVersion | undefined): Col[] => [
    { header: `${header} steps`, cell: (l) => lines(get(l)?.steps) },
    { header: `${header} questions`, cell: (l) => lines(get(l)?.questions) },
    { header: `${header} answers`, cell: (l) => answerLines(get(l)?.answers) },
  ];
  const lessons = allLessons(pkg.units);
  const cols: Col[] = [
    { header: 'Unit', cell: (_, u) => u },
    { header: 'Lesson', cell: (l) => l.title },
    { header: 'Pages', cell: (l) => l.pages },
    { header: 'Minutes', cell: (l) => l.minutes },
    { header: 'Link', cell: (l) => lines(l.links.map((k) => (k.label && k.label !== 'Open lesson' ? `${k.label}: ${k.url}` : k.url))) },
    { header: 'Steps', cell: (l) => lines(l.steps) },
    { header: 'Questions', cell: (l) => lines(l.questions) },
    { header: 'Answers', cell: (l) => answerLines(l.answers) },
    { header: 'Notes', cell: (l) => l.notes },
    ...(lessons.some((l) => l.standards?.length) ? [{ header: 'Standards', cell: (l: PackageLesson) => (l.standards ?? []).join('; ') }] : []),
    ...planLevels(pkg.units).flatMap((lv) => versionCols(lv === 'easier' ? 'Easier' : 'Harder', (l) => l.versions?.[lv])),
    ...planThemes(pkg.units).flatMap((t) => versionCols(t, (l) => l.themes?.find((x) => x.theme.toLowerCase() === t.toLowerCase()))),
  ];
  const rows = lessons.map((l) => cols.map((c) => csvCell(c.cell(l, l.unit))).join(','));
  return [cols.map((c) => csvCell(c.header)).join(','), ...rows].join('\n') + '\n';
}

/** A filename-safe version of the plan's title. */
export function planFileName(pkg: Pick<CurriculumPackage, 'title'>, ext: string): string {
  const base = pkg.title.trim().replace(/[^\p{L}\p{N} _-]+/gu, '').replace(/\s+/g, '-').slice(0, 60) || 'lesson-plan';
  return `${base}.${ext}`;
}

const list = (tag: 'ol' | 'ul', items: string[]) => (items.length ? `<${tag}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>` : '');

function versionBlock(title: string, v: LessonVersion): string {
  if (!v.steps.length && !v.questions.length) return '';
  return `<div class="version"><h4>${esc(title)}</h4>${v.steps.length ? `<p class="k">Steps</p>${list('ol', v.steps)}` : ''}${v.questions.length ? `<p class="k">Questions</p><ol>${v.questions.map((q, i) => `<li>${esc(q)}${v.answers?.[i] ? ` <span class="ans">→ ${esc(v.answers[i])}</span>` : ''}</li>`).join('')}</ol>` : ''}</div>`;
}

/** The whole plan as a teacher's guide: every lesson with its steps, questions and answers, versions, standards, and notes. */
export function planHtml(pkg: CurriculumPackage, creator?: string): string {
  const grade = (g: number) => GRADE_LABELS[g + 1] ?? String(g);
  let n = 0;
  const units = pkg.units
    .map(
      (u, ui) => `<section class="unit"><h2>Unit ${ui + 1}: ${esc(u.title)}</h2>${u.lessons
        .map((l) => {
          n++;
          const meta = [l.pages && `📄 Pages ${l.pages}`, `${l.minutes ?? pkg.minutesPerLesson} min`, ...(l.links.map((k) => `🔗 ${k.label}: ${k.url}`))].filter(Boolean) as string[];
          return `<div class="lesson">
            <h3>${n}. ${esc(l.title)}</h3>
            <p class="meta">${meta.map(esc).join(' · ')}</p>
            ${l.standards?.length ? `<p class="std">Standards: ${l.standards.map((s) => esc(standardLabel(s))).join(' · ')}</p>` : ''}
            ${l.steps.length ? `<p class="k">Steps</p>${list('ol', l.steps)}` : ''}
            ${l.questions.length ? `<p class="k">Questions</p><ol>${l.questions.map((q, i) => `<li>${esc(q)}${l.answers?.[i] ? ` <span class="ans">→ ${esc(l.answers[i])}</span>` : ''}</li>`).join('')}</ol>` : ''}
            ${(['easier', 'harder'] as const).map((lv) => (l.versions?.[lv] ? versionBlock(`${LEVEL_LABEL[lv]} version`, l.versions[lv]!) : '')).join('')}
            ${(l.themes ?? []).map((t) => versionBlock(`🎨 ${t.theme} version`, t)).join('')}
            ${l.notes ? `<p class="notes"><b>Notes:</b> ${esc(l.notes)}</p>` : ''}
          </div>`;
        })
        .join('')}</section>`,
    )
    .join('');
  const credit = pkg.attribution;
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(pkg.title || 'Lesson plan')}</title>
<style>
  @page{margin:14mm}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1d1d1b;margin:0 auto;padding:0 8px;max-width:760px}
  h1{font-size:28px;margin:12px 0 4px} .sub{color:#555;margin:0 0 4px;font-size:14px}
  .desc{font-size:15px;line-height:1.5}
  h2{font-size:19px;border-bottom:2px solid #1d1d1b;padding-bottom:4px;margin:24px 0 6px}
  .lesson{break-inside:avoid;page-break-inside:avoid;border-top:1px solid #ddd;padding:8px 0}
  h3{font-size:16px;margin:0 0 2px} h4{font-size:13px;margin:6px 0 2px;color:#2F6B5E}
  .meta,.std{color:#555;margin:0 0 4px;font-size:12px} .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#777;margin:6px 0 2px}
  ol{margin:0 0 4px;padding-left:22px;font-size:14px} .ans{font-weight:700}
  .version{background:#f8f6f1;border-radius:6px;padding:4px 10px;margin:6px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .notes{font-size:13px;background:#f4f1ea;border-radius:6px;padding:6px 10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .foot{color:#777;font-size:11px;margin-top:18px}
</style></head><body>
  <h1>${esc(pkg.cover)} ${esc(pkg.title || 'Untitled curriculum')}</h1>
  <p class="sub">${esc([creator && `By ${creator}`, pkg.subjects.map(subjectLabel).join(', '), `${grade(pkg.gradeMin)}–${grade(pkg.gradeMax)}`, `${lessonTotal(pkg.units)} lessons`, `${pkg.minutesPerLesson} min · ${pkg.lessonsPerWeek} a week`].filter(Boolean).join(' · '))}</p>
  ${pkg.description ? `<p class="desc">${esc(pkg.description)}</p>` : ''}
  <p class="sub">Teacher’s guide: answers and notes are for grown-ups.</p>
  ${units || '<p>No lessons yet.</p>'}
  ${credit ? `<p class="foot">${esc(credit)}</p>` : ''}
</body></html>`;
}
