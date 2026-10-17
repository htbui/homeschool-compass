import { ageOn, formatDate, todayKey } from './dates';
import { summarizeHours, toHours } from './hours';
import type { HoursSummary } from './hours';
import { PHILOSOPHY_INFO } from './quiz';
import { VERIFY_NOTICE, type StateLaw } from './states';
import { SUBJECTS, subjectLabel } from './subjects';
import type { Child, Curriculum, Evidence, Expense, FamilyProfile, HoursLog, NoiDraft, Subject, Task } from './types';

export const esc = (s: string | number | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const shell = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1d1d1b;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.5}
  h1{font-size:24px;margin:0 0 4px} h2{font-size:18px;margin:28px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
  .muted{color:#666;font-size:13px} table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0}
  td,th{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#f4f1ea}
  .sig{margin-top:40px;border-top:1px solid #333;width:280px;padding-top:4px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px} .grid figure{margin:0;border:1px solid #ddd;padding:6px;break-inside:avoid}
  .grid img{width:100%;height:160px;object-fit:cover} figcaption{font-size:12px;color:#444}
  .notice{background:#fff7e6;border:1px solid #f0d9a8;padding:8px 12px;font-size:12px;margin-top:24px}
  @media print{.pagebreak{page-break-before:always}}
</style></head><body>${body}</body></html>`;

/** Notice of Intent letter, tailored to the state's notice rules. */
export function noiHtml(family: FamilyProfile, law: StateLaw, children: Child[], draft: NoiDraft): string {
  const kids = children
    .map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(formatDate(c.birthdate, { year: 'numeric', month: 'long', day: 'numeric' }))}</td><td>${ageOn(c.birthdate)}</td><td>${esc(c.grade)}</td></tr>`)
    .join('');
  const signed = draft.signedAt ? formatDate(draft.signedAt.slice(0, 10), { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const reqs = law.requirements.map((r) => `<li>${esc(r)}</li>`).join('');
  return shell(
    `Notice of Intent to Homeschool – ${draft.schoolYear}`,
    `
    <p class="muted">${esc(formatDate(todayKey(), { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
    <p>${esc(draft.superintendent || 'Superintendent')}<br/>${esc(draft.district || `${law.name} School District`)}</p>
    <h1>Notice of Intent to Homeschool</h1>
    <p class="muted">School year ${esc(draft.schoolYear)} · ${esc(law.name)}</p>
    <p>Dear ${esc(draft.superintendent || 'Superintendent')},</p>
    <p>Please accept this letter as notice that we will provide home education for the following
    ${children.length === 1 ? 'child' : 'children'} of compulsory school age, in accordance with the homeschool laws of ${esc(law.name)},
    for the ${esc(draft.schoolYear)} school year.</p>
    <table><tr><th>Name</th><th>Date of birth</th><th>Age</th><th>Grade</th></tr>${kids}</table>
    <p>Instruction will be provided at:<br/>${esc(draft.address)}</p>
    <p>Instruction will be provided by ${esc(draft.parentName || family.parentName)}.</p>
    ${law.requiredDays || law.requiredHours ? `<p>We will maintain records of instruction${law.requiredDays ? ` for at least ${law.requiredDays} days` : ''}${law.requiredHours ? `${law.requiredDays ? ' /' : ' totaling at least'} ${law.requiredHours} hours` : ''} as required.</p>` : ''}
    ${reqs ? `<p>We understand the applicable requirements include:</p><ul>${reqs}</ul>` : ''}
    <p>Please direct any correspondence to the address above.</p>
    <p>Sincerely,</p>
    <p style="font-family:'Brush Script MT',cursive;font-size:26px;margin:16px 0 0">${esc(draft.signature)}</p>
    <div class="sig">${esc(draft.parentName || family.parentName)}${signed ? ` · Signed electronically ${esc(signed)}` : ''}</div>
    <div class="notice">${esc(law.noticeNote ?? '')} ${esc(VERIFY_NOTICE)}</div>
  `,
  );
}

export const NOI_CHECKLIST = [
  { key: 'reviewed', label: 'Reviewed state requirements and deadlines' },
  { key: 'signed', label: 'Signed the notice' },
  { key: 'copy', label: 'Kept a copy for your records' },
  { key: 'certified', label: 'Sent via certified mail with return receipt (or submitted online)' },
  { key: 'receipt', label: 'Filed the mailing receipt / confirmation' },
  { key: 'acknowledged', label: 'Received acknowledgment from the district (if they send one)' },
];

function hoursTable(summary: HoursSummary) {
  const rows = (Object.entries(summary.bySubject) as [Subject, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([s, m]) => `<tr><td>${esc(subjectLabel(s))}</td><td>${SUBJECTS[s].core ? 'Core' : 'Non-core'}</td><td>${toHours(m)}</td></tr>`)
    .join('');
  return `<table><tr><th>Subject</th><th>Type</th><th>Hours</th></tr>${rows || '<tr><td colspan="3">No hours logged yet</td></tr>'}
    <tr><th colspan="2">Core total</th><th>${toHours(summary.coreMin)}</th></tr>
    <tr><th colspan="2">Non-core total</th><th>${toHours(summary.nonCoreMin)}</th></tr>
    <tr><th colspan="2">Days of instruction</th><th>${summary.daysAttended}</th></tr></table>`;
}

/** "End of Year Evaluator Packet": hours, curricula, and work samples per child. */
export function evaluatorPacketHtml(args: {
  family: FamilyProfile;
  law?: StateLaw;
  children: Child[];
  tasks: Task[];
  logs: HoursLog[];
  evidence: Evidence[];
  curricula: Curriculum[];
  from: string;
  to: string;
}): string {
  const { family, law, children, tasks, logs, evidence, curricula, from, to } = args;
  const style = family.philosophy?.breakdown[0] ? PHILOSOPHY_INFO[family.philosophy.breakdown[0].philosophy].label : 'Eclectic';
  const sections = children
    .map((c, i) => {
      const summary = summarizeHours(tasks, logs, { childId: c.id, from, to });
      const curr = curricula.filter((k) => k.childIds.includes(c.id));
      const samples = evidence.filter((e) => e.childId === c.id && e.date >= from && e.date <= to);
      const done = tasks.filter((t) => t.childId === c.id && t.status === 'done' && t.date >= from && t.date <= to);
      const reflections = done.filter((t) => t.reflection).slice(-8);
      return `
      <section class="${i > 0 ? 'pagebreak' : ''}">
        <h2>${esc(c.avatar)} ${esc(c.name)} — ${esc(c.grade)} (age ${ageOn(c.birthdate)})</h2>
        <p class="muted">${done.length} activities completed · ${samples.length} work samples</p>
        <h3>Instructional hours</h3>${hoursTable(summary)}
        <h3>Curricula</h3>
        ${curr.length ? `<table><tr><th>Curriculum</th><th>Subject</th><th>Progress</th></tr>${curr.map((k) => `<tr><td>${esc(k.name)}</td><td>${esc(subjectLabel(k.subject))}</td><td>${k.lessonsDone} / ${k.totalLessons} lessons</td></tr>`).join('')}</table>` : '<p class="muted">None recorded.</p>'}
        ${reflections.length ? `<h3>Student reflections</h3><ul>${reflections.map((t) => `<li><b>${esc(t.title)}</b> (${esc(formatDate(t.date))}): ${esc(t.reflection)}</li>`).join('')}</ul>` : ''}
        <h3>Work samples</h3>
        ${samples.length ? `<div class="grid">${samples.map((e) => `<figure><img src="${esc(e.uri)}"/><figcaption>${esc(formatDate(e.date))} · ${esc(subjectLabel(e.subject))}${e.standard ? ` · ${esc(e.standard)}` : ''}<br/>${esc(e.note)}</figcaption></figure>`).join('')}</div>` : '<p class="muted">No samples captured in this period.</p>'}
      </section>`;
    })
    .join('');

  return shell(
    `${family.familyName} – Evaluator Packet`,
    `
    <h1>${esc(family.familyName)} Home Education Portfolio</h1>
    <p class="muted">${esc(formatDate(from, { year: 'numeric', month: 'long', day: 'numeric' }))} – ${esc(formatDate(to, { year: 'numeric', month: 'long', day: 'numeric' }))}
    · ${esc(law?.name ?? family.stateCode)} · Educator: ${esc(family.parentName)} · Approach: ${esc(style)}</p>
    ${law ? `<p class="muted">State requirements: ${law.requiredDays ? `${law.requiredDays} days` : ''}${law.requiredDays && law.requiredHours ? ' / ' : ''}${law.requiredHours ? `${law.requiredHours} hours` : ''}${!law.requiredDays && !law.requiredHours ? 'no fixed day/hour count' : ''}.</p>` : ''}
    ${sections}
    <div class="notice">Generated by Kinship. ${esc(VERIFY_NOTICE)}</div>
  `,
  );
}

/** Itemized supply-cost / ESA report for tax time or ESA reconciliation. */
export function expenseReportHtml(family: FamilyProfile, expenses: Expense[], children: Child[], year: string): string {
  const name = (id?: string) => children.find((c) => c.id === id)?.name ?? 'Family';
  const total = (src?: Expense['fundingSource']) => expenses.filter((e) => !src || e.fundingSource === src).reduce((a, e) => a + e.amount, 0);
  const money = (n: number) => `$${n.toFixed(2)}`;
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.vendor)}</td><td>${esc(e.description)}</td><td>${esc(e.category)}</td><td>${esc(name(e.childId))}</td><td>${esc(e.fundingSource.replace(/_/g, ' '))}${e.approvedVendor ? ' ✓' : ''}</td><td>${money(e.amount)}</td></tr>`)
    .join('');
  return shell(
    `${family.familyName} – Education Expenses ${year}`,
    `
    <h1>Education Expense Report</h1>
    <p class="muted">${esc(family.familyName)} · ${esc(year)} · ${esc(family.stateCode)}</p>
    <table><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Category</th><th>Student</th><th>Funding</th><th>Amount</th></tr>${rows}</table>
    <table>
      <tr><th>ESA-funded</th><td>${money(total('esa'))}</td></tr>
      <tr><th>Tax credit / deduction eligible</th><td>${money(total('tax'))}</td></tr>
      <tr><th>Out of pocket</th><td>${money(total('out_of_pocket'))}</td></tr>
      <tr><th>Total</th><th>${money(total())}</th></tr>
    </table>
    <p class="muted">✓ = approved vendor. Keep original receipts with this report.</p>
    <div class="notice">Not tax advice. ${esc(VERIFY_NOTICE)}</div>
  `,
  );
}
