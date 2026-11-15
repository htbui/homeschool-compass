import { attr, decode, jsonLd, jsonObjectAt, links, listTrees, textOf, type ListNode } from './html';
import { detectLicense, type License, type LicenseKind } from './license';
import { newLesson, newUnit, type PackageLesson, type PackageUnit } from './package';

/**
 * Readers for the places free curricula usually live, each in its own
 * outline format: YouTube playlists, Pressbooks and LibreTexts textbooks,
 * Wikibooks and Wikiversity, schema.org data, and nested lists. They only
 * read the page the creator asked for (plus, for LibreTexts, that book's
 * public outline), and every result is a best guess reviewed in the editor.
 */

export interface SiteImport {
  units: PackageUnit[];
  warnings: string[];
  title?: string;
  author?: string;
  license?: License;
}

/** A better page to read for this course (its table of contents, or a print version with every section). */
export interface NextPage {
  url: string;
  /** How to read it: LibreTexts' outline is JSON; anything else is a web page. */
  kind: 'libretexts' | 'page';
  /** Load it right away (the first page has no outline of its own). */
  auto: boolean;
  label: string;
}

// ───────────────────────────── Shared link rules

export const SKIP_LINK =
  /^(home|about|about us|contact|contact us|login|log in|sign in|sign up|register|search|menu|privacy|privacy policy|terms|terms of use|cookie|cookies|donate|share|tweet|facebook|twitter|instagram|pinterest|youtube|subscribe|next|previous|prev|back|top|back to top|skip to content|read more|more|edit|edit source|view source|edit this page|printable version|print|print this page|download|download pdf|pdf|pdf version|history|view history|talk|discussion|permanent link|permalink|cite|cite this page|help|faq|feedback|report|log out|\[?\d+\]?|\^|↑)$/i;
/** Wiki/CMS housekeeping links (edit, history, special pages) that are never lessons. */
export const HOUSEKEEPING =
  /[?&](action|veaction|oldid|diff|printable)=|\/(Special|Talk|User|User_talk|Help|Template|Category|File|Portal|Draft|MediaWiki|Module|Wikibooks|Wikiversity|Wikipedia|Wikijunior_talk):|\/w\/index\.php|\/(login|signin|signup|register|cart|account)\b/i;
export const SOCIAL = /(facebook|twitter|x|instagram|pinterest|linkedin|tiktok)\.com$/i;
/** Sections that point elsewhere rather than holding the course's lessons. */
export const SKIP_SECTION = /^(see also|references|external links|further reading|notes|footnotes|sources|bibliography|related( pages| courses| resources)?|prerequisites|navigation|front|front matter|back matter)$/i;

/** A lesson link resolved against the page, or undefined when it's navigation, social, or housekeeping. */
export function lessonHref(href: string, base: URL): URL | undefined {
  let url: URL;
  try {
    url = new URL(decode(href), base);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(url.protocol) || SOCIAL.test(url.hostname) || /creativecommons\.org/.test(url.hostname) || HOUSEKEEPING.test(url.href)) return undefined;
  return url;
}

/** The first link in a piece of HTML that could be a lesson (skipping icons that link to help pages and the like). */
export function lessonLink(html: string, base: URL): { url: URL; text: string } | undefined {
  for (const a of links(html)) {
    const url = lessonHref(a.href, base);
    if (url) return { url, text: a.text };
  }
  return undefined;
}

/** Long lists of lessons → units of about ten. */
export function chunkUnits(lessons: PackageLesson[], size = 10, label = 'Lessons'): PackageUnit[] {
  // Even-sized units: 11 lessons are 6 + 5, not 10 + 1.
  const per = Math.ceil(lessons.length / Math.ceil(lessons.length / size));
  const units: PackageUnit[] = [];
  for (let i = 0; i < lessons.length; i += per) units.push(newUnit(lessons.length > size ? `${label} ${i + 1}–${Math.min(lessons.length, i + per)}` : label, lessons.slice(i, i + per)));
  return units;
}

const total = (units: PackageUnit[]) => units.reduce((n, u) => n + u.lessons.length, 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ───────────────────────────── Licenses written as data

/** A license given as a URL or a schema.org object (`{ url, name }`). */
export function licenseFrom(value: unknown): License | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return licenseFrom(value[0]);
  if (typeof value === 'string') return detectLicense(value.includes('creativecommons.org') ? value : `<a href="${value}">${value}</a>`) ?? detectLicense(value);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return licenseFrom(o.url ?? o['@id']) ?? (typeof o.name === 'string' ? detectLicense(o.name.replace(/\bCC BY\b/i, 'Creative Commons Attribution')) : undefined);
  }
  return undefined;
}

const names = (v: unknown): string | undefined => {
  const list = (Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? (x as { name?: unknown }).name : undefined)).filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (!list.length) return undefined;
  const clean = list.map((n) => decode(n).replace(/\s+/g, ' ').trim());
  return clean.length > 3 ? `${clean.slice(0, 3).join(', ')}, and others` : clean.join(', ');
};

/** The page's main work as schema.org describes it: its name, authors, and license. */
export function jsonLdInfo(html: string): { title?: string; author?: string; license?: License } {
  const works = jsonLd(html).filter((o) => /^(Book|Course|CreativeWork|LearningResource|WebPage|CollectionPage|ItemList|Article)$/.test(String(o['@type'])));
  const main = works.find((o) => o.license) ?? works.find((o) => /Book|Course/.test(String(o['@type']))) ?? works[0];
  if (!main) return {};
  return {
    title: typeof main.name === 'string' ? decode(main.name).trim() : undefined,
    author: names(main.author) ?? names(main.creator),
    license: licenseFrom(main.license),
  };
}

// ───────────────────────────── YouTube playlists

/** The playlist id in a YouTube address (a playlist page, or a video watched from a playlist). */
export function playlistId(url: URL): string | undefined {
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') return undefined;
  const list = url.searchParams.get('list');
  return list && /^[\w-]{10,64}$/.test(list) ? list : undefined;
}

/**
 * A YouTube playlist page → one lesson per video, read from the data the
 * page embeds for its own scripts (`ytInitialData`), so no API key is needed.
 */
export function parseYouTubePlaylist(html: string, pageUrl: string): SiteImport {
  const list = playlistId(new URL(pageUrl));
  const at = html.search(/ytInitialData"?\]?\s*=/);
  const data = at >= 0 ? jsonObjectAt(html, at) : undefined;
  const videos: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  let title: string | undefined;
  let author: string | undefined;
  const runText = (v: unknown): string | undefined => {
    const o = v as { simpleText?: string; content?: string; runs?: { text?: string }[] } | undefined;
    return o?.simpleText ?? o?.content ?? o?.runs?.map((r) => r.text ?? '').join('');
  };
  const add = (id: unknown, name: unknown) => {
    if (typeof id !== 'string' || typeof name !== 'string' || seen.has(id) || /^\[(private|deleted) video\]$/i.test(name)) return;
    seen.add(id);
    videos.push({ id, title: name.trim() });
  };
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 60) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    const lockup = o.lockupViewModel as { contentId?: string; contentType?: string; metadata?: { lockupMetadataViewModel?: { title?: unknown } } } | undefined;
    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') add(lockup.contentId, runText(lockup.metadata?.lockupMetadataViewModel?.title));
    const old = o.playlistVideoRenderer as { videoId?: string; title?: unknown } | undefined;
    if (old) add(old.videoId, runText(old.title));
    const pm = o.playlistMetadataRenderer as { title?: string } | undefined;
    if (pm?.title) title ??= pm.title;
    const owner = o.videoOwnerRenderer as { title?: unknown } | undefined;
    if (owner) author ??= runText(owner.title);
    for (const [k, x] of Object.entries(o)) if (k !== 'lockupViewModel' && k !== 'playlistVideoRenderer') walk(x, depth + 1);
  };
  walk(data, 0);
  title ??= decode(html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? '').trim() || undefined;

  const warnings: string[] = [];
  if (!videos.length) {
    warnings.push('Couldn’t read the videos in this playlist (YouTube may want you to sign in or accept cookies first). Open the playlist in your browser, select its list of videos, copy it, and paste it below. Video links you paste with it are kept.');
    return { units: [], warnings, title, author };
  }
  const lessons = videos.map((v) => newLesson(v.title, { links: [{ label: 'Watch', url: `https://www.youtube.com/watch?v=${v.id}${list ? `&list=${list}` : ''}` }] }));
  if (videos.length >= 100) warnings.push('YouTube shows only the first 100 videos of a playlist here. Add later videos by pasting them below.');
  warnings.push('Each lesson links to its video on YouTube. The videos belong to their creators, so check their license (under “Show more” on each video) before publishing.');
  return { units: chunkUnits(lessons, 10, 'Videos'), warnings, title, author };
}

// ───────────────────────────── Pressbooks

const isPressbooks = (html: string) => /\/themes\/pressbooks-book\/|<meta[^>]+generator[^>]+Pressbooks|class=["'][^"']*\btoc__(part|chapter)\b/i.test(html);

/** A Pressbooks book's table of contents (its home page or /table-of-contents) → units by part, lessons by chapter. */
export function parsePressbooks(html: string, pageUrl: string): SiteImport | undefined {
  if (!isPressbooks(html)) return undefined;
  const toc = listTrees(html).find((l) => /(^|\s)toc(\s|$)/.test(l.cls));
  if (!toc) return undefined;
  const base = new URL(pageUrl);
  const units: PackageUnit[] = [];
  const chapter = (n: ListNode) => {
    const a = lessonLink(n.own, base);
    return a?.text ? newLesson(a.text, { links: [{ label: 'Read', url: a.url.href }] }) : undefined;
  };
  let loose: PackageUnit | undefined;
  for (const item of toc.items) {
    if (/toc__(front|back)-matter/.test(item.cls)) continue;
    if (/toc__part/.test(item.cls)) {
      const lessons = item.children.map(chapter).filter((l): l is PackageLesson => !!l);
      if (lessons.length) units.push(newUnit(textOf(item.own) || 'Chapters', lessons));
      loose = undefined;
    } else if (/toc__chapter/.test(item.cls)) {
      const lesson = chapter(item);
      if (!lesson) continue;
      if (!loose) units.push((loose = newUnit('Chapters')));
      loose.lessons.push(lesson);
    }
  }
  if (!units.length) return undefined;
  const info = jsonLdInfo(html);
  const author = info.author ?? (textOf(html.match(/<span class="block-info__author__names">([\s\S]*?)<\/span>/i)?.[1] ?? '') || undefined);
  // The book's own license (its metadata), not the first Creative Commons link on the page (often an image credit).
  const statement = html.match(/<div class="license-attribution">([\s\S]*?)<\/div>/i)?.[1];
  const license = info.license ?? (statement ? detectLicense(statement) : undefined);
  const warnings = license ? ['Pressbooks chapters can carry their own licenses. Check any chapter that notes a different one before publishing.'] : [];
  return { units: units.length > 1 || units[0].lessons.length <= 12 ? units : chunkUnits(units[0].lessons, 10, 'Chapters'), warnings, title: info.title, author, license };
}

/** A Pressbooks chapter's book (where its table of contents is). */
function pressbooksHome(html: string, pageUrl: string): string | undefined {
  if (!isPressbooks(html) || /\btoc__(part|chapter)\b/.test(html)) return undefined;
  const u = new URL(pageUrl);
  const m = u.pathname.match(/^(.*?\/)(chapter|part|front-matter|back-matter)\//);
  return m ? `${u.origin}${m[1]}` : undefined;
}

// ───────────────────────────── LibreTexts

const LIBRE_KIND: Record<string, LicenseKind> = {
  ccby: 'cc_by',
  ccbysa: 'cc_by_sa',
  ccbync: 'cc_by_nc',
  ccbyncsa: 'cc_by_nc_sa',
  ccbynd: 'cc_by_nd',
  ccbyncnd: 'cc_by_nc_nd',
  publicdomain: 'public_domain',
  cc0: 'cc0',
  arr: 'all_rights_reserved',
};
type LibreLicense = { label?: string; link?: string; raw?: string; version?: string; count?: number };
const libreLicense = (l?: LibreLicense): License | undefined => {
  const kind = l?.raw ? LIBRE_KIND[l.raw] : undefined;
  if (!kind) return undefined;
  return { kind, version: kind.startsWith('cc_by') ? l?.version : undefined, url: l?.link && l.link.startsWith('http') ? l.link : undefined };
};

/** LibreTexts' public outline for a book page (it also lists every page's license). */
function libreTextsOutline(html: string, pageUrl: string): string | undefined {
  const u = new URL(pageUrl);
  if (!/\.libretexts\.org$/.test(u.hostname) || u.hostname.startsWith('commons.')) return undefined;
  const id = html.match(/"pageId"\s*:\s*(\d+)/)?.[1];
  const lib = u.hostname.split('.')[0];
  return id && /^[a-z]+$/.test(lib) ? `https://commons.libretexts.org/api/v1/commons/book/${lib}-${id}/licensereport` : undefined;
}

type LibreNode = { title?: string; url?: string; license?: LibreLicense; children?: LibreNode[] };

/**
 * Book order: LibreTexts lists pages by address, so "1.10" can come before
 * "1.2" and the end-of-chapter pages ("1.E: Exercises", "1.S: Summary") first.
 */
function inOrder(nodes: LibreNode[]): LibreNode[] {
  const key = (n: LibreNode) => {
    const m = (n.title ?? '').match(/^(?:\d+\.)?(\d+)\s*:/) ?? (n.title ?? '').match(/^\d+\.(\d+)\b/);
    if (m) return Number(m[1]);
    if (/^(\d+\.)?[A-Z]{1,2}\s*:/.test(n.title ?? '')) return Infinity;
    return /^(front|back) matter$/i.test(n.title ?? '') ? NaN : -1;
  };
  const keyed = nodes.map((n, i) => ({ n, i, k: key(n) }));
  // Only reorder when every page is numbered (front and back matter are skipped anyway).
  if (keyed.some((x) => x.k < 0)) return nodes;
  return keyed.filter((x) => !Number.isNaN(x.k)).sort((a, b) => (a.k === b.k ? a.i - b.i : a.k - b.k)).map((x) => x.n);
}

/**
 * A LibreTexts book outline (its license report, or plain outline) → units by
 * chapter, lessons by section. LibreTexts books mix pages under different
 * licenses, so the most restrictive one is used and the mix is spelled out.
 */
export function parseLibreTexts(json: string): SiteImport {
  let doc: { data?: { meta?: { mostRestrictiveLicense?: LibreLicense; licenses?: LibreLicense[]; specialRestrictions?: string[] }; text?: LibreNode }; toc?: LibreNode } = {};
  try {
    doc = JSON.parse(json);
  } catch {
    // Not an outline; the page's own listing is used instead.
  }
  const root = doc.data?.text ?? doc.toc;
  if (!root?.children?.length) return { units: [], warnings: [] };
  const lesson = (n: LibreNode) => newLesson(decode(n.title ?? '').trim(), { links: n.url ? [{ label: 'Read', url: n.url }] : [] });
  const units: PackageUnit[] = [];
  let loose: PackageUnit | undefined;
  for (const ch of inOrder(root.children)) {
    if (!ch.title || /^(front|back) matter$/i.test(ch.title)) continue;
    if (ch.children?.length) {
      units.push(newUnit(decode(ch.title).trim(), inOrder(ch.children.filter((s) => s.title)).map(lesson)));
      loose = undefined;
    } else {
      if (!loose) units.push((loose = newUnit(decode(root.title ?? 'Lessons').trim())));
      loose.lessons.push(lesson(ch));
    }
  }
  const warnings: string[] = [];
  const meta = doc.data?.meta;
  const license = libreLicense(meta?.mostRestrictiveLicense ?? root.license);
  const mix = (meta?.licenses ?? []).filter((l) => l.count);
  if (mix.length > 1) {
    const list = mix.map((l) => `${l.raw === 'notset' ? 'no license stated' : l.label} (${plural(l.count!, 'page')})`).join(', ');
    warnings.push(`This book’s pages use different licenses: ${list}. ${license ? 'Your plan uses the most restrictive one; ' : ''}check the book’s “Detailed Licensing” page before publishing.`);
  }
  if (meta?.specialRestrictions?.length) warnings.push(`Some pages carry extra restrictions (${meta.specialRestrictions.join(', ')}). Check them before publishing.`);
  if (!license && meta?.mostRestrictiveLicense?.label) warnings.push(`LibreTexts lists this book as “${meta.mostRestrictiveLicense.label}”. Check its terms and choose its license below.`);
  return { units, warnings, title: root.title ? decode(root.title).trim() : undefined, license };
}

// ───────────────────────────── Wikibooks and Wikiversity

const isWiki = (u: URL) => /(^|\.)(wikibooks|wikiversity)\.org$/.test(u.hostname);
const isPrintVersion = (u: URL) => /\/(Print|Printable)_version$/i.test(decodeURIComponent(u.pathname));
const SKIP_CHAPTER = /^(cover|contributors|authors|license|gnu free documentation license|contents|table of contents|index|about the book|print version|printable version)$/i;

/**
 * A Wikibooks print version (the whole book on one page) → units by chapter,
 * lessons by section, each linking to that section of its chapter's own page.
 */
export function parseWikiPrint(html: string, pageUrl: string): SiteImport | undefined {
  const base = new URL(pageUrl);
  if (!isPrintVersion(base)) return undefined;
  const start = html.indexOf('mw-parser-output');
  const body = (start >= 0 ? html.slice(start) : html).split(/<div[^>]+class=["']printfooter/i)[0];
  const book = decodeURIComponent(base.pathname).replace(/^\/wiki\//, '').replace(/\/(Print|Printable)_version$/i, '');
  const page = (title: string, id?: string) => `${base.origin}/wiki/${encodeURI(title.replace(/ /g, '_'))}${id ? `#${id}` : ''}`;
  type Section = { level: number; text: string; url: string };
  const chapters: { title: string; sections: Section[] }[] = [];
  let current: { title: string; sections: Section[] } | undefined;
  const re = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const text = textOf(m[3]);
    if (!text) continue;
    // Each section's edit link names the chapter page it lives on; chapter titles have none.
    const edit = body.slice(re.lastIndex, re.lastIndex + 700).match(/^\s*(?:<\/div>)?\s*<span class="mw-editsection">[\s\S]*?title=([^&"]+)&amp;(?:ve)?action=edit&amp;section=T-\d+/);
    if (!edit) {
      current = SKIP_CHAPTER.test(text) || text.replace(/ /g, '_') === `${book}/Printable_version` ? undefined : { title: text, sections: [] };
      if (current) chapters.push(current);
    } else if (current) {
      current.sections.push({ level: Number(m[1]), text, url: page(decodeURIComponent(decode(edit[1])), attr(m[2], 'id')) });
    }
  }
  // A chapter's top-level sections are its lessons (sub-sections stay inside them).
  const units = chapters.map((c) => {
    const top = Math.min(...c.sections.map((s) => s.level));
    const lessons = c.sections.filter((s) => s.level === top).map((s) => newLesson(s.text, { links: [{ label: 'Read', url: s.url }] }));
    return newUnit(c.title.replace(/\//g, ': '), lessons);
  });
  // Chapters with no sections are one lesson: the chapter's page.
  for (const u of units) if (!u.lessons.length) u.lessons.push(newLesson(u.title, { links: [{ label: 'Read', url: page(`${book}/${u.title.replace(/: /g, '/')}`) }] }));
  return units.length ? { units, warnings: [] } : undefined;
}

/** "Fractions/What Is a Fraction?" right after "Fractions" → a unit for that chapter, with its subpages as lessons. */
export function nestSubpages(units: PackageUnit[]): PackageUnit[] {
  const path = (l: PackageLesson) => {
    try {
      return decodeURIComponent(new URL(l.links[0]?.url ?? '').pathname).replace(/\/$/, '');
    } catch {
      return '';
    }
  };
  const out: PackageUnit[] = [];
  for (const u of units) {
    const groups: { lesson: PackageLesson; path: string; sections: PackageLesson[] }[] = [];
    for (const l of u.lessons) {
      const p = path(l);
      const g = groups.at(-1);
      if (g?.path && p.startsWith(`${g.path}/`)) g.sections.push({ ...l, title: l.title.split('/').filter(Boolean).at(-1)?.trim() || l.title });
      else groups.push({ lesson: l, path: p, sections: [] });
    }
    if (!groups.some((g) => g.sections.length)) {
      out.push(u);
      continue;
    }
    let rest: PackageUnit | undefined;
    for (const g of groups) {
      if (g.sections.length) {
        out.push(newUnit(g.lesson.title.replace(/^\//, '').replace(/\//g, ': '), [g.lesson, ...g.sections]));
        rest = undefined;
      } else {
        if (!rest) out.push((rest = newUnit(u.title)));
        rest.lessons.push(g.lesson);
      }
    }
  }
  return out;
}

/** Wikibooks main pages often link a print version with every section. */
function wikiPrintLink(html: string, pageUrl: string): string | undefined {
  const base = new URL(pageUrl);
  if (!isWiki(base) || isPrintVersion(base)) return undefined;
  const href = html.match(/href=["'](\/wiki\/[^"'#?]+\/(?:Print|Printable)_version)["']/i)?.[1];
  return href ? new URL(href, base).href : undefined;
}

// ───────────────────────────── schema.org outlines (JSON-LD)

type Node = { name: string; url?: string; children: Node[] };

function ldNode(o: Record<string, unknown>, depth = 0): Node | undefined {
  if (depth > 4) return undefined;
  const item = o.item && typeof o.item === 'object' ? (o.item as Record<string, unknown>) : undefined;
  const name = o.name ?? o.headline ?? item?.name ?? item?.headline;
  const url = o.url ?? item?.url ?? (typeof (item ?? o)['@id'] === 'string' && /^https?:/.test((item ?? o)['@id'] as string) ? (item ?? o)['@id'] : undefined);
  const src = item ?? o;
  const arr = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  const parts = [
    ...arr(src.itemListElement).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)),
    ...arr(src.hasPart),
    ...arr(src.syllabusSections),
    ...arr(src.hasCourseInstance).flatMap((ci) => arr(ci.hasPart)),
  ];
  const children = parts.map((p) => ldNode(p, depth + 1)).filter((n): n is Node => !!n);
  if (typeof name !== 'string' && !children.length) return undefined;
  return { name: typeof name === 'string' ? decode(name).replace(/\s+/g, ' ').trim() : '', url: typeof url === 'string' ? url : undefined, children };
}

/** A schema.org Course, Book, or ItemList with parts → units and lessons. */
export function parseJsonLdOutline(html: string, pageUrl: string): SiteImport | undefined {
  const base = new URL(pageUrl);
  const roots = jsonLd(html)
    .filter((o) => /^(Course|Book|ItemList|CreativeWork|LearningResource|CourseInstance|Syllabus)$/.test(String(o['@type'])))
    .map((o) => ldNode(o))
    .filter((n): n is Node => !!n && n.children.length > 0);
  const size = (n: Node): number => n.children.reduce((a, c) => a + 1 + size(c), 0);
  const root = roots.sort((a, b) => size(b) - size(a))[0];
  if (!root) return undefined;
  const lesson = (n: Node) => {
    const url = n.url ? lessonHref(n.url, base) : undefined;
    return newLesson(n.name, { links: url ? [{ label: 'Open lesson', url: url.href }] : [] });
  };
  const flat = (n: Node): Node[] => n.children.flatMap((c) => [c, ...flat(c)]);
  let units: PackageUnit[];
  if (root.children.some((c) => c.children.length)) {
    units = [];
    let loose: PackageUnit | undefined;
    for (const c of root.children) {
      if (c.children.length) {
        units.push(newUnit(c.name || 'Lessons', flat(c).filter((n) => n.name).map(lesson)));
        loose = undefined;
      } else if (c.name) {
        if (!loose) units.push((loose = newUnit(root.name || 'Lessons')));
        loose.lessons.push(lesson(c));
      }
    }
  } else units = chunkUnits(root.children.filter((c) => c.name).map(lesson));
  if (total(units) < 3) return undefined;
  const info = jsonLdInfo(html);
  return { units, warnings: [], title: root.name || info.title, author: info.author, license: info.license };
}

// ───────────────────────────── Nested lists

/**
 * The page's biggest nested list (an outline written as <ol>/<ul> inside
 * list items) → units from the outer items, lessons from the items inside.
 */
export function parseNestedLists(body: string, pageUrl: string): PackageUnit[] {
  const base = new URL(pageUrl);
  const lesson = (n: ListNode): PackageLesson | undefined => {
    const a = lessonLink(n.own, base);
    const own = textOf(n.own);
    // A link followed by a description: the link names the lesson.
    const text = a && a.text.length >= 3 && own.length > 120 ? a.text : own;
    if (!text || text.length > 200 || SKIP_LINK.test(text)) return undefined;
    return newLesson(text, { links: a ? [{ label: 'Open lesson', url: a.url.href }] : [] });
  };
  const flat = (n: ListNode): ListNode[] => n.children.flatMap((c) => [c, ...flat(c)]);
  let best: PackageUnit[] = [];
  for (const list of listTrees(body)) {
    // Menus are nested lists too.
    if (/menu|nav|dropdown|breadcrumb|footer|sidebar|social|comment/i.test(`${list.cls} ${list.items[0]?.cls ?? ''}`)) continue;
    // A list with a single item wrapping the real one (a list inside a <div> inside an item).
    const outer = list.items.length === 1 && list.items[0].children.length ? list.items[0].children : list.items;
    // An outline: most of its items sit in lists inside the outer items.
    const parents = outer.filter((i) => i.children.length);
    if (parents.length < 2 || parents.reduce((n, i) => n + i.children.length, 0) < outer.length - parents.length) continue;
    // Unit names are short (long ones are threads of comments or answers).
    if (parents.some((i) => textOf(i.own).length > 120)) continue;
    const units: PackageUnit[] = [];
    let loose: PackageUnit | undefined;
    for (const item of outer) {
      if (item.children.length) {
        const lessons = flat(item).map(lesson).filter((l): l is PackageLesson => !!l);
        if (lessons.length) units.push(newUnit(textOf(item.own) || 'Lessons', lessons));
        loose = undefined;
      } else {
        const l = lesson(item);
        if (!l) continue;
        if (!loose) units.push((loose = newUnit('Lessons')));
        loose.lessons.push(l);
      }
    }
    if (total(units) > total(best)) best = units;
  }
  return best;
}

// ───────────────────────────── What to read next

/** A better page for this course: LibreTexts' outline, a Pressbooks chapter's book, or a Wikibooks print version. */
export function nextPage(html: string, pageUrl: string): NextPage | undefined {
  const libre = libreTextsOutline(html, pageUrl);
  if (libre) return { url: libre, kind: 'libretexts', auto: true, label: 'the book’s outline from LibreTexts' };
  const home = pressbooksHome(html, pageUrl);
  if (home) return { url: home, kind: 'page', auto: true, label: 'the book’s table of contents' };
  const print = wikiPrintLink(html, pageUrl);
  if (print) return { url: print, kind: 'page', auto: false, label: 'Load the printable version (every section as a lesson)' };
  return undefined;
}

export { isWiki };
