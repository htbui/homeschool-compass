/**
 * Small, forgiving HTML helpers for reading course pages without a DOM
 * (the importers run in the app and in tests, never in a browser frame).
 */

export const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

export const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1];

export const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : undefined;
};

/**
 * The JSON object that starts at `from` (the first "{" at or after it), read
 * by matching braces outside of strings — for data a page assigns in a
 * script, like `var ytInitialData = {...};`.
 */
export function jsonObjectAt(text: string, from: number): unknown {
  const start = text.indexOf('{', from);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Every schema.org JSON-LD object on the page (`@graph` entries flattened). */
export function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const push = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(push);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (Array.isArray(o['@graph'])) push(o['@graph']);
        else out.push(o);
      }
    };
    push(data);
  }
  return out;
}

/** An item of an HTML list: its own text and first link, and any list nested inside it. */
export interface ListNode {
  /** The `class` of the <li>. */
  cls: string;
  /** Inner HTML of the item, without its nested lists. */
  own: string;
  children: ListNode[];
}

/**
 * The page's lists as trees. Returns the top-level lists (each an array of
 * items); items keep any list nested inside them as children.
 */
export function listTrees(html: string): { cls: string; items: ListNode[] }[] {
  const roots: { cls: string; items: ListNode[] }[] = [];
  /** An open list: its items, the item now open, and the item it's nested in. */
  type Frame = { cls: string; items: ListNode[]; item?: ListNode; parent?: ListNode; mark: number };
  const stack: Frame[] = [];
  const re = /<(\/?)(ul|ol|li)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  // Text since the last tag belongs to the open item (outside nested lists).
  const flush = (end: number) => {
    const top = stack.at(-1);
    if (top?.item) top.item.own += html.slice(top.mark, end);
  };
  while ((m = re.exec(html))) {
    const [tag, close, name, attrs] = m;
    const n = name.toLowerCase();
    flush(m.index);
    if (n === 'li') {
      const top = stack.at(-1);
      if (top) {
        if (!close) {
          top.item = { cls: attr(attrs, 'class') ?? '', own: '', children: [] };
          top.items.push(top.item);
        } else top.item = undefined;
      }
    } else if (!close) {
      stack.push({ cls: attr(attrs, 'class') ?? '', items: [], parent: stack.at(-1)?.item, mark: 0 });
    } else {
      const frame = stack.pop();
      if (frame) {
        if (frame.parent) frame.parent.children.push(...frame.items);
        else if (!stack.length) roots.push({ cls: frame.cls, items: frame.items });
        else stack.at(-1)!.items.push(...frame.items);
      }
    }
    const top = stack.at(-1);
    if (top) top.mark = m.index + tag.length;
  }
  return roots;
}

/** The links in a piece of HTML, in order. */
export function links(html: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = attr(m[1], 'href');
    if (href) out.push({ href: decode(href), text: textOf(m[2]) });
  }
  return out;
}
