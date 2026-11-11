import { lessonFor, lessonLabel } from './curriculum';
import { ageOn, formatClock, formatDate, toMinutes } from './dates';
import { esc } from './documents';
import { subjectLabel } from './subjects';
import type { Child, Curriculum, Subject, Task } from './types';

/**
 * Printable lesson sheets so learning can happen off-screen: one page per
 * task with the steps as checkboxes and a work area shaped for the subject
 * (handwriting lines, graph paper, or a drawing box).
 */

export interface WorksheetContext {
  children: Child[];
  curricula: Curriculum[];
  /** All tasks, so upcoming lessons get the right numbers. */
  tasks?: Task[];
  parentName?: string;
}

const WRITING: Subject[] = ['writing', 'phonics', 'reading', 'foreign_language', 'bible', 'history', 'civics'];
const GRID: Subject[] = ['math'];
const DRAW: Subject[] = ['art', 'science', 'geography', 'free_play', 'life_skills', 'pe', 'health', 'music', 'other'];

type WorkArea = 'lines' | 'primary' | 'grid' | 'draw';

export function workAreaFor(subject: Subject, age: number): WorkArea {
  if (GRID.includes(subject)) return 'grid';
  if (DRAW.includes(subject)) return 'draw';
  if (WRITING.includes(subject)) return age <= 7 ? 'primary' : 'lines';
  return 'lines';
}

const workArea = (kind: WorkArea) => {
  switch (kind) {
    case 'grid':
      return '<div class="area grid"></div>';
    case 'draw':
      return '<div class="area draw"><span>Draw or paste your work here</span></div>';
    case 'primary':
      return `<div class="area">${'<div class="primary"><i></i></div>'.repeat(6)}</div>`;
    default:
      return `<div class="area">${'<div class="line"></div>'.repeat(12)}</div>`;
  }
};

function sheet(task: Task, ctx: WorksheetContext): string {
  const kid = ctx.children.find((k) => k.id === task.childId);
  const age = kid ? ageOn(kid.birthdate, task.date) : 10;
  const young = age <= 7;
  const lesson = lessonLabel(task, ctx.curricula, ctx.tasks);
  const plan = lessonFor(task, ctx.curricula, ctx.tasks);
  const credit = ctx.curricula.find((c) => c.id === task.curriculumId)?.attribution;
  const questions = plan?.questions.length
    ? `<h2>Questions</h2><ol class="questions">${plan.questions.map((q) => `<li>${esc(q)}<div class="line"></div><div class="line"></div></li>`).join('')}</ol>`
    : '';
  const reading = plan?.pages || plan?.links.length ? `<p class="meta">${plan.pages ? `📄 Pages ${esc(plan.pages)}` : ''}${plan.pages && plan.links.length ? ' · ' : ''}${plan.links.map((l) => `🔗 ${esc(l.label)}: ${esc(l.url)}`).join(' · ')}</p>` : '';
  const withWho = task.mode === 'parent' ? `with ${ctx.parentName?.split(' ')[0] || 'a grown-up'}` : task.mode === 'group' ? 'with the family' : 'on my own';
  const steps = task.steps.length
    ? `<h2>Steps</h2><ol class="steps">${task.steps.map((s) => `<li><span class="box">${s.done ? '✓' : ''}</span>${esc(s.label)}</li>`).join('')}</ol>`
    : '';
  return `
  <section class="sheet${young ? ' young' : ''}">
    <div class="namebar"><span>Name: <b>${esc(kid?.name ?? '')}</b></span><span>Date: <b>${esc(formatDate(task.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</b></span></div>
    <h1><span class="icon">${esc(task.icon)}</span> ${esc(task.title)}</h1>
    <p class="meta">${esc(subjectLabel(task.subject))} · ${esc(formatClock(task.start))} · ${task.durationMin} minutes · ${esc(withWho)}${lesson ? `<br/>${esc(lesson)}` : ''}</p>
    ${reading}
    ${steps}
    ${questions}
    <h2>My work</h2>
    ${workArea(workAreaFor(task.subject, age))}
    <div class="bottom">
      <div><h2>How did it go?</h2><div class="faces"><span>☐ 😕 Tricky</span><span>☐ 🙂 Got it</span><span>☐ 🤩 Easy!</span></div></div>
      ${young ? '' : '<div><h2>One thing I learned</h2><div class="line"></div><div class="line"></div></div>'}
    </div>
    <p class="foot">Time spent: ______ min &nbsp;·&nbsp; Grown-up check: ☐ &nbsp;·&nbsp; Keep this page for the portfolio, or snap a photo of it in Freerange.${credit ? `<br/>${esc(credit)}` : ''}</p>
  </section>`;
}

function cover(tasks: Task[], ctx: WorksheetContext, title: string): string {
  const byKid = ctx.children.filter((k) => tasks.some((t) => t.childId === k.id));
  const rows = (kidId: string) =>
    tasks
      .filter((t) => t.childId === kidId)
      .map((t) => `<tr><td class="box-cell"><span class="box"></span></td><td>${esc(formatClock(t.start))}</td><td>${esc(t.icon)} ${esc(t.title)}</td><td>${t.durationMin} min</td></tr>`)
      .join('');
  return `
  <section class="sheet">
    <h1>${esc(title)}</h1>
    ${byKid
      .map(
        (k) => `<h2>${esc(k.avatar)} ${esc(k.name)}</h2>
      <table><tr><th></th><th>Time</th><th>Mission</th><th>Length</th></tr>${rows(k.id)}</table>`,
      )
      .join('')}
    <p class="foot">Check off each mission as you finish it. A worksheet for each one follows.</p>
  </section>`;
}

/**
 * HTML for one task (a single worksheet) or several (a day packet: a
 * checklist cover, then one worksheet page per task).
 */
export function worksheetHtml(tasks: Task[], ctx: WorksheetContext, title?: string): string {
  const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start) || a.childId.localeCompare(b.childId));
  const docTitle = title ?? (sorted.length === 1 ? sorted[0].title : 'Lesson packet');
  const body = [sorted.length > 1 ? cover(sorted, ctx, docTitle) : '', ...sorted.map((t) => sheet(t, ctx))].filter(Boolean).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(docTitle)}</title>
<style>
  @page{margin:14mm}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1d1d1b;margin:0;padding:0 8px}
  .sheet{max-width:760px;margin:0 auto 24px;page-break-after:always;break-after:page}
  .sheet:last-child{page-break-after:auto;break-after:auto}
  .namebar{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1d1d1b;padding-bottom:6px;font-size:14px}
  h1{font-size:28px;margin:16px 0 4px} .young h1{font-size:36px} .icon{font-size:1.2em}
  h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#555;margin:18px 0 6px}
  .meta{color:#555;margin:0;font-size:14px;line-height:1.5}
  .steps{padding-left:0;list-style:none;margin:0} .steps li{display:flex;gap:10px;align-items:center;font-size:16px;padding:5px 0}
  .young .steps li{font-size:22px}
  .box{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:2px solid #1d1d1b;border-radius:4px;flex:none;font-size:14px}
  .area{border:1.5px solid #999;border-radius:8px;padding:10px 14px;min-height:300px}
  .line{border-bottom:1px solid #9a9a9a;height:30px}
  .primary{height:52px;border-top:1px solid #777;border-bottom:1px solid #777;margin-bottom:12px;position:relative}
  .primary i{position:absolute;left:0;right:0;top:50%;border-top:1px dashed #aaa}
  .grid{background-image:linear-gradient(#d4d4d4 1px,transparent 1px),linear-gradient(90deg,#d4d4d4 1px,transparent 1px);background-size:20px 20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;min-height:340px}
  .draw{min-height:360px;display:flex;align-items:flex-end;justify-content:flex-end} .draw span{color:#aaa;font-size:12px}
  .bottom{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .faces{display:flex;gap:16px;font-size:16px;flex-wrap:wrap}
  .foot{color:#777;font-size:11px;margin-top:18px}
  .questions{padding-left:20px;margin:0} .questions li{font-size:16px;margin:6px 0 14px}
  table{border-collapse:collapse;width:100%;font-size:15px} td,th{border:1px solid #ccc;padding:7px 8px;text-align:left} th{background:#f4f1ea}
  .box-cell{width:28px}
</style></head><body>${body}</body></html>`;
}

/** Tasks whose lesson has answers or parent notes to print. */
export function hasAnswerKey(task: Task, ctx: Pick<WorksheetContext, 'curricula' | 'tasks'>): boolean {
  const plan = lessonFor(task, ctx.curricula, ctx.tasks);
  return !!plan && (!!plan.answers?.some(Boolean) || !!plan.notes);
}

/**
 * The grown-ups' copy: each lesson's questions with their answers, and the
 * parent notes. Printed separately so it never ends up in a kid's packet.
 */
export function answerKeyHtml(tasks: Task[], ctx: WorksheetContext, title = 'Answer key'): string {
  const sorted = tasks
    .filter((t) => hasAnswerKey(t, ctx))
    .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start) || a.childId.localeCompare(b.childId));
  const body = sorted
    .map((t) => {
      const plan = lessonFor(t, ctx.curricula, ctx.tasks)!;
      const kid = ctx.children.find((k) => k.id === t.childId);
      const rows = plan.questions
        .map((q, i) => `<tr><td class="num">${i + 1}</td><td>${esc(q)}</td><td class="ans">${plan.answers?.[i] ? esc(plan.answers[i]) : '<span class="none">—</span>'}</td></tr>`)
        .join('');
      return `<div class="lesson">
        <h2>${esc(lessonLabel(t, ctx.curricula, ctx.tasks) ?? t.title)}</h2>
        <p class="meta">${esc(kid?.name ?? '')} · ${esc(formatDate(t.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
        ${rows ? `<table><tr><th></th><th>Question</th><th>Answer</th></tr>${rows}</table>` : ''}
        ${plan.notes ? `<p class="notes"><b>Notes:</b> ${esc(plan.notes)}</p>` : ''}
      </div>`;
    })
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  @page{margin:14mm}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1d1d1b;margin:0 auto;padding:0 8px;max-width:760px}
  h1{font-size:26px;margin:12px 0 2px} .sub{color:#777;margin:0 0 12px;font-size:13px}
  .lesson{break-inside:avoid;page-break-inside:avoid;border-top:2px solid #1d1d1b;padding-top:8px;margin-top:16px}
  h2{font-size:17px;margin:0 0 2px} .meta{color:#555;margin:0 0 8px;font-size:13px}
  table{border-collapse:collapse;width:100%;font-size:14px} td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top} th{background:#f4f1ea}
  .num{width:24px;color:#777} .ans{font-weight:700;width:38%} .none{color:#aaa;font-weight:400}
  .notes{font-size:14px;background:#f8f6f1;border-radius:6px;padding:8px 10px}
</style></head><body>
  <h1>🔑 ${esc(title)}</h1><p class="sub">For grown-ups. Keep this page away from the worksheets.</p>
  ${body || '<p>No answers or notes for these lessons yet.</p>'}
</body></html>`;
}

/** A one-page test print to check the printer, paper size, and margins. */
export function testPageHtml(printerName?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Freerange test page</title>
<style>
  @page{margin:14mm}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1d1d1b;margin:0}
  .frame{border:3px solid #2F6B5E;border-radius:12px;padding:28px;min-height:80vh;display:flex;flex-direction:column;gap:14px}
  h1{margin:0;font-size:30px} .grid{height:160px;background-image:linear-gradient(#ccc 1px,transparent 1px),linear-gradient(90deg,#ccc 1px,transparent 1px);background-size:20px 20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .swatches{display:flex;gap:8px} .swatches span{width:60px;height:30px;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body><div class="frame">
  <h1>🧭 Freerange test page</h1>
  <p>If you can read this and see the full green border, printing is set up${printerName ? ` on <b>${esc(printerName)}</b>` : ''}.</p>
  <p>The border should sit inside the paper edge on all four sides. If it's cut off, check the paper size in Settings → Printing.</p>
  <div class="grid"></div>
  <div class="swatches"><span style="background:#2F6B5E"></span><span style="background:#E3A33B"></span><span style="background:#E07A5F"></span><span style="background:#4C7FD9"></span></div>
  <p style="color:#777;font-size:12px">Printed ${esc(new Date().toLocaleString())}</p>
</div></body></html>`;
}
