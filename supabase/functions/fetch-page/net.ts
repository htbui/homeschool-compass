// Pure helpers for fetch-page (no Deno APIs here, so they're unit-tested in
// src/lib/__tests__/fetchNet.test.ts): which addresses are public, the HTTP
// request we send to a pinned address, and reading its response.

// ───────────────────────────── Public addresses only

function v4(ip: string): number[] | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return undefined;
  return parts.map(Number);
}

/** An IPv6 address as eight 16-bit numbers (with "::" expanded and an IPv4 tail converted). */
export function v6(ip: string): number[] | undefined {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const b = v4(tail[1]);
    if (!b) return undefined;
    s = s.slice(0, -tail[1].length) + `${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const read = (h: string) => (h ? h.split(':') : []);
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return undefined;
  const groups = [...head, ...Array(fill).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return undefined;
  return groups.map((g) => parseInt(g, 16));
}

function privateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local (cloud metadata lives here)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/**
 * True for any address that isn't on the public internet: private,
 * loopback, link-local, multicast, documentation and benchmarking ranges,
 * and IPv6 forms that carry such an IPv4 address inside them.
 * Anything that isn't a valid address counts as private.
 */
export function isPrivateAddress(ip: string): boolean {
  const a = v4(ip);
  if (a) return privateV4(a);
  const g = v6(ip);
  if (!g) return true;
  const embedded = (hi: number, lo: number) => privateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.slice(0, 7).every((x) => x === 0)) return true; // :: and ::1 (and the old IPv4-compatible form)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(g[6], g[7]); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return embedded(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export const isIpLiteral = (host: string) => !!v4(host) || host.includes(':');

/** Why this address can't be fetched (before looking up its name), or undefined when it's fine so far. */
export function checkUrl(u: URL, allowPrivate = false): string | undefined {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only web pages (http or https) can be imported.';
  if (u.username || u.password) return 'Addresses with passwords can’t be imported.';
  if (allowPrivate) return undefined;
  if (u.port && u.port !== '80' && u.port !== '443') return 'Only standard web ports can be imported.';
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // Names that only mean something inside a network ("intranet", "printer.local").
  if (host === 'localhost' || /\.(localhost|internal|local|lan|home\.arpa)$/.test(host) || (!host.includes('.') && !host.includes(':'))) return 'That address isn’t public.';
  if (isIpLiteral(host) && isPrivateAddress(host)) return 'That address isn’t public.';
  return undefined;
}

/**
 * The one address to connect to: every address the name resolved to must
 * be public (a site with even one internal address is refused), then the
 * first IPv4 address is used (IPv6 if there's none).
 */
export function pinAddress(addresses: string[], allowPrivate = false): { address: string } | { problem: string } {
  if (!addresses.length) return { problem: 'Couldn’t find that website.' };
  if (!allowPrivate && addresses.some(isPrivateAddress)) return { problem: 'That address isn’t public.' };
  return { address: addresses.find((a) => !!v4(a)) ?? addresses[0] };
}

// ───────────────────────────── HTTP/1.1 over a pinned connection

/** The request we write to the socket: the page's own host in the Host header, nothing kept alive. */
export function requestFor(u: URL, headers: Record<string, string>): string {
  const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  const lines = [`GET ${u.pathname || '/'}${u.search} HTTP/1.1`, `Host: ${host}`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v.replace(/[\r\n]/g, '')}`), 'Accept-Encoding: gzip, identity', 'Connection: close', '', ''];
  return lines.join('\r\n');
}

export interface ResponseHead {
  status: number;
  headers: Map<string, string>;
  /** Where the body starts in the bytes read so far. */
  bodyStart: number;
}

const HEAD_LIMIT = 64 * 1024;

/** The status line and headers, once the bytes read so far hold all of them. Throws on a response that isn't HTTP. */
export function parseHead(bytes: Uint8Array): ResponseHead | undefined {
  let end = -1;
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    if (bytes.length > HEAD_LIMIT) throw new Error('Response headers too large');
    return undefined;
  }
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, end));
  const [statusLine, ...lines] = text.split('\r\n');
  const m = statusLine.match(/^HTTP\/1\.[01] (\d{3})/);
  if (!m) throw new Error('Not an HTTP response');
  const headers = new Map<string, string>();
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    headers.set(k, headers.has(k) ? `${headers.get(k)}, ${v}` : v);
  }
  return { status: Number(m[1]), headers, bodyStart: end + 4 };
}

/** Undoes `Transfer-Encoding: chunked`, fed the body bytes as they arrive. */
export class ChunkedDecoder {
  private buf = new Uint8Array(0);
  private left = 0; // bytes left in the current chunk
  private state: 'size' | 'data' | 'crlf' | 'trailer' | 'done' = 'size';
  get done() {
    return this.state === 'done';
  }
  push(bytes: Uint8Array): Uint8Array[] {
    const joined = new Uint8Array(this.buf.length + bytes.length);
    joined.set(this.buf);
    joined.set(bytes, this.buf.length);
    let at = 0;
    const out: Uint8Array[] = [];
    const lineEnd = () => {
      for (let i = at; i + 1 < joined.length; i++) if (joined[i] === 13 && joined[i + 1] === 10) return i;
      return -1;
    };
    while (at < joined.length && this.state !== 'done') {
      if (this.state === 'size' || this.state === 'trailer') {
        const e = lineEnd();
        if (e < 0) break;
        const line = new TextDecoder('latin1').decode(joined.subarray(at, e));
        at = e + 2;
        if (this.state === 'trailer') {
          if (!line) this.state = 'done';
          continue;
        }
        const size = parseInt(line.split(';')[0].trim(), 16);
        if (!Number.isFinite(size) || size < 0) throw new Error('Bad chunk size');
        if (size === 0) this.state = 'trailer';
        else {
          this.left = size;
          this.state = 'data';
        }
      } else if (this.state === 'data') {
        const n = Math.min(this.left, joined.length - at);
        out.push(joined.slice(at, at + n));
        at += n;
        this.left -= n;
        if (!this.left) this.state = 'crlf';
      } else {
        if (joined.length - at < 2) break;
        at += 2;
        this.state = 'size';
      }
    }
    this.buf = joined.slice(at);
    return out;
  }
}

/** The text encoding a Content-Type names, if the decoder knows it (UTF-8 otherwise). */
export function charsetOf(contentType: string): string {
  const label = contentType.match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
  if (!label) return 'utf-8';
  try {
    new TextDecoder(label);
    return label;
  } catch {
    return 'utf-8';
  }
}

// ───────────────────────────── Rate limits

/** What to tell someone who has loaded too many pages (from claim_page_fetch()). */
export function limitMessage(claim: { ok: boolean; reason?: string; retry_after?: number }): string | undefined {
  if (claim.ok) return undefined;
  const wait = Math.max(1, Math.round(claim.retry_after ?? 60));
  if (claim.reason === 'day') return 'You’ve loaded a lot of pages today. Try again tomorrow, or paste the course outline instead.';
  return `That’s a lot of pages in a minute. Try again in ${wait} second${wait === 1 ? '' : 's'}.`;
}
