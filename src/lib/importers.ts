import { detectLicense, type License } from './license';
import { newLesson, newUnit, type LessonLink, type PackageLesson, type PackageUnit } from './package';

/**
 * Turn what people already have into lesson plans:
 *  - a book's table of contents (typed, pasted, or copied from a photo),
 *  - a spreadsheet of lessons (pasted from Sheets/Excel, or CSV),
 *  - a free curriculum's web page (its headings and lesson links).
 * Everything here is a best guess the creator reviews in the editor.
 */

export interface ImportResult {
  units: PackageUnit[];
  warnings: string[];
}

const UNIT_WORDS = /^(unit|chapter|part|module|section|book|term|week|topic|level|volume|quarter|semester|month)\b/i;
const LABEL_END = /\b(lesson|chapter|unit|part|week|day|book|level|grade|volume|module|section|step|page|pp?\.?|no\.?|#)$/i;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

interface Line {
  depth: number;
  text: string;
  page?: number;
  pages?: string;
  url?: string;
  heading: boolean;
}

/** Leading whitespace as a nesting depth (tabs count as 4 spaces). */
const indentOf = (raw: string) => raw.match(/^[ \t]*/)![0].replace(/\t/g, '    ').length;

function parseLine(raw: string): Line | undefined {
  const depth = indentOf(raw);
  let text = raw.trim();
  if (!text) return undefined;
  let heading = false;
  const md = text.match(/^(#{1,3})\s+(.*)$/);
  if (md) {
    heading = md[1].length <= 2;
    text = md[2];
  }
  text = text.replace(/^[-*•·–—▪︎◦]+\s*/, '');
  let url: string | undefined;
  const u = text.match(URL_RE);
  if (u) {
    url = u[0].replace(/[.,;]+$/, '');
    text = text.replace(u[0], '').replace(/[\s:–—-]+$/, '').trim();
  }
  // Page ranges written into the line: "Read pp. 12–18", "pages 4-9".
  let pages: string | undefined;
  const range = text.match(/\b(?:pp?\.?|pages?)\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\b/i);
  if (range) pages = `${range[1]}–${range[2]}`;
  // A trailing page number: after dot leaders, a tab, or wide spacing — or a
  // plain trailing number when the title clearly isn't "Lesson 5".
  let page: number | undefined;
  const leader = text.match(/^(.*?)(?:\s*[.·…]{2,}\s*|\t+|\s{2,})(\d{1,4})$/);
  if (leader && leader[1].trim()) {
    text = leader[1].trim();
    page = Number(leader[2]);
  } else {
    const plain = text.match(/^(.*\S)\s+(\d{1,4})$/);
    if (plain && !LABEL_END.test(plain[1]) && plain[1].split(/\s+/).length >= 2 && /[a-z]/i.test(plain[1])) {
      text = plain[1];
      page = Number(plain[2]);
    }
  }
  text = text.replace(/\s*[.·…]+$/, '').trim();
  if (!text && !url) return undefined;
  return { depth, text: text || url!, page, pages, url, heading };
}

const isUnitLine = (l: Line) => l.heading || UNIT_WORDS.test(l.text);
/** "1.2 Adding fractions" — a sub-numbered entry is always a lesson. */
const isSubNumbered = (t: string) => /^\d+\.\d+/.test(t);

function lessonFrom(l: Line): PackageLesson {
  const links: LessonLink[] = l.url ? [{ label: 'Open lesson', url: l.url }] : [];
  return newLesson(l.text, { links, pages: l.pages });
}

/**
 * Fill page ranges from start pages: each lesson runs until the next lesson
 * or chapter starts. `starts` holds lesson and unit ids in document order.
 */
function fillPageRanges(units: PackageUnit[], starts: Map<string, number>, lastPage?: number) {
  const order = units.flatMap((u) => [{ id: u.id, lesson: undefined as PackageLesson | undefined }, ...u.lessons.map((l) => ({ id: l.id, lesson: l as PackageLesson | undefined }))]);
  order.forEach(({ id, lesson }, i) => {
    const start = starts.get(id);
    if (!lesson || start === undefined || lesson.pages) return;
    const next = order.slice(i + 1).map((x) => starts.get(x.id)).find((p) => p !== undefined && p > start);
    const end = next !== undefined ? next - 1 : lastPage;
    lesson.pages = end !== undefined && end > start ? `${start}–${end}` : end === start ? `${start}` : `${start}+`;
  });
}

export interface OutlineOptions {
  /** Split chapters that have no lessons into lessons of about this many pages. */
  pagesPerLesson?: number;
  /** The book's last page, to close the final range. */
  lastPage?: number;
}

/** A table of contents (or any outline) → units and lessons. */
export function parseOutline(text: string, opts: OutlineOptions = {}): ImportResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map(parseLine).filter((l): l is Line => !!l);
  if (!lines.length) return { units: [], warnings: ['Nothing to import — paste a table of contents, one entry per line.'] };

  const minDepth = Math.min(...lines.map((l) => l.depth));
  const indented = lines.some((l) => l.depth > minDepth);
  const hasUnitWords = lines.some((l) => isUnitLine(l) && !isSubNumbered(l.text));
  const unitAt = (l: Line) => {
    if (isSubNumbered(l.text)) return false;
    if (hasUnitWords) return isUnitLine(l);
    // Otherwise the outer level of an indented outline holds the units.
    return indented && l.depth === minDepth;
  };

  const units: PackageUnit[] = [];
  const starts = new Map<string, number>();
  const unitStarts = new Map<string, number>();
  let current: PackageUnit | undefined;
  for (const l of lines) {
    if (unitAt(l)) {
      current = newUnit(l.text);
      units.push(current);
      if (l.page !== undefined) {
        unitStarts.set(current.id, l.page);
        starts.set(current.id, l.page);
      }
      continue;
    }
    if (!current) {
      current = newUnit('Lessons');
      units.push(current);
    }
    const lesson = lessonFrom(l);
    if (l.page !== undefined) starts.set(lesson.id, l.page);
    current.lessons.push(lesson);
  }

  // Chapters with no lessons under them: split by pages, or one lesson each.
  const bare = units.filter((u) => !u.lessons.length);
  if (bare.length) {
    const unitPages = units.map((u) => unitStarts.get(u.id));
    units.forEach((u, i) => {
      if (u.lessons.length) return;
      const start = unitPages[i];
      const next = unitPages.slice(i + 1).find((p) => p !== undefined);
      const end = next !== undefined ? next - 1 : opts.lastPage;
      const per = opts.pagesPerLesson;
      if (per && start !== undefined && end !== undefined && end >= start) {
        const count = Math.max(1, Math.round((end - start + 1) / per));
        const size = (end - start + 1) / count;
        u.lessons = Array.from({ length: count }, (_, k) => {
          const a = Math.round(start + k * size);
          const b = k === count - 1 ? end : Math.round(start + (k + 1) * size) - 1;
          return newLesson(count === 1 ? u.title : `${u.title} (${k + 1} of ${count})`, { pages: a === b ? `${a}` : `${a}–${b}` });
        });
      } else {
        const lesson = newLesson(u.title);
        if (start !== undefined) starts.set(lesson.id, start);
        u.lessons = [lesson];
      }
    });
    if (!opts.pagesPerLesson) warnings.push(`${bare.length} chapter${bare.length === 1 ? '' : 's'} had no lessons listed, so each became one lesson. Set pages per lesson to split them.`);
  }
  fillPageRanges(units, starts, opts.lastPage);
  // Collapse a lone placeholder unit name when there were no units at all.
  if (units.length === 1 && units[0].title === 'Lessons') warnings.push('No units or chapters found — everything is in one unit. Rename it, or add “Unit”/“Chapter” lines.');
  return { units, warnings };
}

// ───────────────────────────── Spreadsheets

type Column = 'unit' | 'title' | 'pages' | 'minutes' | 'link' | 'steps' | 'questions' | 'answers' | 'notes';
const HEADERS: Record<Column, RegExp> = {
  unit: /^(unit|chapter|module|week|section|part|topic group)$/i,
  title: /^(lesson|lesson title|title|topic|name|lesson name|activity)$/i,
  pages: /^(pages?|reading|pp\.?)$/i,
  minutes: /^(minutes?|mins?|time|duration|length)$/i,
  link: /^(link|url|video|resource|website)$/i,
  steps: /^(steps|activities|tasks|to ?do|instructions)$/i,
  questions: /^(questions|worksheet|exercises|problems|review questions)$/i,
  answers: /^(answers?|answer key|key|solutions?)$/i,
  notes: /^(notes?|teacher notes|parent notes|comments)$/i,
};

/** Split CSV/TSV text into rows, honoring quoted cells. */
export function splitRows(text: string): string[][] {
  const delim = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const listCell = (v?: string) => (v ? v.split(/\s*[;|\n]\s*/).map((s) => s.trim()).filter(Boolean) : []);

/** A spreadsheet of lessons → units and lessons. Recognizes common column names. */
export function parseTable(text: string): ImportResult {
  const rows = splitRows(text);
  if (!rows.length) return { units: [], warnings: ['Nothing to import — paste rows from a spreadsheet, or a CSV.'] };
  const header = rows[0];
  const cols = new Map<Column, number>();
  header.forEach((h, i) => {
    const key = (Object.keys(HEADERS) as Column[]).find((k) => HEADERS[k].test(h.trim()));
    if (key && !cols.has(key)) cols.set(key, i);
  });
  const warnings: string[] = [];
  let body = rows;
  if (cols.has('title')) body = rows.slice(1);
  else {
    // No header row: first column is the lesson, a numeric-looking second column is pages.
    cols.set('title', 0);
    if (rows.every((r) => !r[1] || /^\d[\d\s–-]*$/.test(r[1]))) cols.set('pages', 1);
    warnings.push('No header row found, so the first column was used as lesson titles. Add headers like Unit, Lesson, Pages, Link, Steps for more.');
  }
  const get = (r: string[], c: Column) => (cols.has(c) ? r[cols.get(c)!] : undefined);
  const units: PackageUnit[] = [];
  for (const r of body) {
    const title = get(r, 'title');
    if (!title) continue;
    const unitName = get(r, 'unit') || units.at(-1)?.title || 'Lessons';
    let unit = units.at(-1);
    if (!unit || unit.title !== unitName) {
      unit = newUnit(unitName);
      units.push(unit);
    }
    const minutes = Number(get(r, 'minutes'));
    const link = get(r, 'link');
    unit.lessons.push(
      newLesson(title, {
        pages: get(r, 'pages')?.replace(/^pp?\.?\s*/i, '').replace('-', '–') || undefined,
        minutes: Number.isFinite(minutes) && minutes > 0 && minutes <= 480 ? Math.round(minutes) : undefined,
        links: link && URL_RE.test(link) ? [{ label: 'Open lesson', url: link.match(URL_RE)![0] }] : [],
        steps: listCell(get(r, 'steps')),
        questions: listCell(get(r, 'questions')),
        answers: listCell(get(r, 'answers')).length ? listCell(get(r, 'answers')) : undefined,
        notes: get(r, 'notes') || undefined,
      }),
    );
  }
  if (!units.length) warnings.push('No lessons found in those rows.');
  return { units, warnings };
}

// ───────────────────────────── Web pages

export interface WebImport extends ImportResult {
  title: string;
  author?: string;
  license?: License;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1];

const SKIP_LINK =
  /^(home|about|about us|contact|contact us|login|log in|sign in|sign up|register|search|menu|privacy|privacy policy|terms|terms of use|cookie|cookies|donate|share|tweet|facebook|twitter|instagram|pinterest|youtube|subscribe|next|previous|prev|back|top|back to top|skip to content|read more|more|edit|edit source|view source|edit this page|printable version|print|print this page|download|download pdf|pdf|pdf version|history|view history|talk|discussion|permanent link|permalink|cite|cite this page|help|faq|feedback|report|log out|\[?\d+\]?|\^|↑)$/i;
/** Wiki/CMS housekeeping links (edit, history, special pages) that are never lessons. */
const HOUSEKEEPING = /[?&](action|veaction|oldid|diff|printable)=|\/(Special|Talk|User|Help|Template|Category|File|Wikibooks|Wikiversity|Wikipedia):|\/w\/index\.php|\/(login|signin|signup|register|cart|account)\b/i;
const SOCIAL = /(facebook|twitter|x|instagram|pinterest|linkedin|tiktok)\.com$/i;

/**
 * A free curriculum's page → units (its section headings) and lessons (the
 * links or list items under each). Navigation, footers, and social links are
 * ignored; the source's license and author are picked up for attribution.
 */
export function parseWebPage(html: string, pageUrl: string): WebImport {
  const warnings: string[] = [];
  const license = detectLicense(html);
  const title = decode(meta(html, 'og:title') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim() || new URL(pageUrl).hostname;
  const author = meta(html, 'author') ?? meta(html, 'article:author') ?? undefined;

  const main =
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<body[\s\S]*?<\/body>/i)?.[0] ??
    html;
  const body = main.replace(/<(script|style|nav|header|footer|aside|form|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const base = new URL(pageUrl);

  type Token = { kind: 'heading'; text: string } | { kind: 'link'; text: string; href: string } | { kind: 'item'; text: string };
  const tokens: Token[] = [];
  const re = /<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1>|<li\b[^>]*>([\s\S]*?)<\/li>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1]) {
      const t = textOf(m[2]).replace(/\s*\[\s*edit( source)?\s*\]\s*$/i, '');
      if (t) tokens.push({ kind: 'heading', text: t });
    } else if (m[3] !== undefined) {
      const inner = m[3];
      const a = inner.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
      if (a) {
        const href = a[1].match(/href=["']([^"']+)["']/i)?.[1];
        if (href) tokens.push({ kind: 'link', text: textOf(inner), href });
      } else {
        const t = textOf(inner);
        if (t) tokens.push({ kind: 'item', text: t });
      }
    } else {
      const href = m[4].match(/href=["']([^"']+)["']/i)?.[1];
      let text = textOf(m[5]);
      // Contents lines like "<a>CHAPTER I.</a> Jenny Wren Arrives": keep the name that follows the label.
      if (href?.startsWith('#') && /^((chapter|lesson|part|book|section|story|lecture)\s+)?[ivxlcdm\d]+\.?$/i.test(text)) {
        const tail = textOf(body.slice(re.lastIndex, re.lastIndex + 300).split(/<(?:br|a\b|\/?p\b|\/td|\/tr|\/li|\/div|\/?h\d)/i)[0]);
        if (tail) text = `${text} ${tail}`;
      }
      if (href) tokens.push({ kind: 'link', text, href });
    }
  }

  const units: PackageUnit[] = [];
  const seen = new Set<string>();
  // Links to places on this same page: the table of contents of a book on one page (Project Gutenberg).
  const anchors: PackageLesson[] = [];
  let current: PackageUnit | undefined;
  for (const t of tokens) {
    if (t.kind === 'heading') {
      current = newUnit(t.text);
      units.push(current);
      continue;
    }
    if (!t.text || t.text.length < 3 || t.text.length > 200 || SKIP_LINK.test(t.text)) continue;
    let lesson: PackageLesson;
    if (t.kind === 'link') {
      let url: URL;
      try {
        url = new URL(decode(t.href), base);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || SOCIAL.test(url.hostname) || /creativecommons\.org/.test(url.hostname) || HOUSEKEEPING.test(url.href)) continue;
      if (url.href.split('#')[0] === base.href.split('#')[0]) {
        if (url.hash.length > 1 && !seen.has(url.href)) {
          seen.add(url.href);
          anchors.push(newLesson(t.text, { links: [{ label: 'Read', url: url.href }] }));
        }
        continue;
      }
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      lesson = newLesson(t.text, { links: [{ label: 'Open lesson', url: url.href }] });
    } else {
      lesson = newLesson(t.text);
    }
    if (!current) {
      current = newUnit('Lessons');
      units.push(current);
    }
    current.lessons.push(lesson);
  }
  let kept = units.filter((u) => u.lessons.length);
  const linked = kept.reduce((n, u) => n + u.lessons.filter((l) => l.links.length).length, 0);
  // A whole book on one page: its contents links (or, without them, its chapter headings) are the lessons.
  const onPage = anchors.length >= 3 ? anchors : headingAnchors(body, base);
  if (onPage.length >= 3 && linked < onPage.length / 2) {
    kept = chunkUnits(onPage);
    warnings.length = 0;
    warnings.push('This looks like a whole book on one page, so each chapter became a lesson. Group them into units in the editor if you like.');
  }
  if (!kept.length && scriptBuilt(html)) warnings.push('This site builds its pages with scripts, so its outline can’t be read automatically. Open the course in your browser, select its list of units and lessons, copy it, and paste it below. Lesson links you paste with it are kept.');
  else if (!kept.length) warnings.push('Couldn’t find a list of lessons on that page. Paste the course outline instead — the source and license are still recorded.');
  else if (kept.length < units.length) warnings.push('Some sections without lessons were left out.');
  if (!license) warnings.push('No license found on that page. Check the source’s terms and choose its license before publishing.');
  const gutenberg = gutenbergInfo(html);
  return {
    units: kept.slice(0, 60).map((u) => ({ ...u, lessons: u.lessons.slice(0, 200) })),
    warnings: license || !gutenberg ? warnings : warnings.filter((w) => !w.startsWith('No license')),
    title: gutenberg?.title ?? title,
    author: gutenberg?.author ?? author,
    license: license ?? gutenberg?.license,
  };
}

/** Headings that carry an id (chapters of a one-page book with no contents links). */
function headingAnchors(body: string, base: URL): PackageLesson[] {
  const out: PackageLesson[] = [];
  const re = /<(h[1-3])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const id = m[2].match(/\bid=["']([^"']+)["']/i)?.[1] ?? m[3].match(/<a\b[^>]*\b(?:id|name)=["']([^"']+)["']/i)?.[1];
    const text = textOf(m[3]);
    if (!id || !text || text.length > 160 || /^(contents|table of contents|preface|index|footnotes?|transcriber.*)$/i.test(text)) continue;
    out.push(newLesson(text, { links: [{ label: 'Read', url: new URL(`#${id}`, base).href }] }));
  }
  return out;
}

/** Long lists of chapters → units of about ten. */
function chunkUnits(lessons: PackageLesson[], size = 10): PackageUnit[] {
  const units: PackageUnit[] = [];
  for (let i = 0; i < lessons.length; i += size) units.push(newUnit(lessons.length > size ? `Lessons ${i + 1}–${Math.min(lessons.length, i + size)}` : 'Lessons', lessons.slice(i, i + size)));
  return units;
}

/** Pages whose content arrives by script: almost no text, lots of script. */
function scriptBuilt(html: string): boolean {
  const scripts = (html.match(/<script\b/gi) ?? []).length;
  const text = textOf(html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' '));
  return scripts >= 3 && text.length < 1500;
}

/** Project Gutenberg's header: title, author, and whether it's public domain in the US. */
export function gutenbergInfo(html: string): { title?: string; author?: string; license?: License } | undefined {
  if (!/Project Gutenberg/i.test(html)) return undefined;
  const text = textOf(html.slice(0, 60000));
  const field = (name: string) => {
    const v = html.match(new RegExp(`<strong>${name}</strong>\\s*:\\s*([^<]+)`, 'i'))?.[1] ?? text.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1];
    return v ? decode(v).replace(/\s+/g, ' ').trim() : undefined;
  };
  const free = /for the use of anyone anywhere in the United States/i.test(text) && !/Copyrighted Project Gutenberg/i.test(text);
  return { title: field('Title'), author: field('Author'), license: free ? { kind: 'public_domain' } : undefined };
}

// ───────────────────────────── Where the course lives

export type SourceKind = 'gutenberg' | 'scan' | 'page';

/**
 * The page to read for a course address. Project Gutenberg book pages point
 * to the book itself (one HTML page with every chapter); archive.org scans
 * have no text outline, so their outline is pasted and linked page by page.
 */
export function sourceAddress(url: string): { kind: SourceKind; fetchUrl: string; scanId?: string } {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const gb = host.endsWith('gutenberg.org') ? u.pathname.match(/^\/ebooks\/(\d+)/) : null;
  if (gb) return { kind: 'gutenberg', fetchUrl: `https://www.gutenberg.org/cache/epub/${gb[1]}/pg${gb[1]}-images.html` };
  if (host.endsWith('gutenberg.org')) return { kind: 'gutenberg', fetchUrl: u.href };
  const scan = host === 'archive.org' ? u.pathname.match(/^\/details\/([^/]+)/) : null;
  if (scan) return { kind: 'scan', fetchUrl: `https://archive.org/metadata/${scan[1]}`, scanId: scan[1] };
  return { kind: 'page', fetchUrl: u.href };
}

/** archive.org's record for a scanned book. "Not in copyright" scans published before 1930 are public domain in the US. */
export function parseScanRecord(json: string): { title?: string; author?: string; year?: number; publicDomain: boolean } {
  let m: Record<string, unknown> = {};
  try {
    m = (JSON.parse(json) as { metadata?: Record<string, unknown> }).metadata ?? {};
  } catch {
    // Not a record; leave it to the creator.
  }
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
  const year = Number(String(one(m.date) ?? one(m.year) ?? '').match(/\d{4}/)?.[0]) || undefined;
  const status = String(one(m['possible-copyright-status']) ?? '');
  return { title: one(m.title), author: one(m.creator), year, publicDomain: /NOT_IN_COPYRIGHT/i.test(status) && !!year && year < 1930 };
}

/**
 * Link each lesson to the page of an online scan where it starts. `firstPage`
 * is the scan page showing printed page 1 (from the viewer's /page/nN address);
 * without it, archive.org's own page numbers are used.
 */
export function linkScanPages(units: PackageUnit[], scanId: string, firstPage?: number): PackageUnit[] {
  return units.map((u) => ({
    ...u,
    lessons: u.lessons.map((l) => {
      const start = Number(l.pages?.match(/\d+/)?.[0]);
      if (!start || l.links.length) return l;
      const page = firstPage !== undefined ? `n${start + firstPage - 1}` : String(start);
      return { ...l, links: [{ label: `Read p. ${start}`, url: `https://archive.org/details/${scanId}/page/${page}/mode/1up` }] };
    }),
  }));
}
