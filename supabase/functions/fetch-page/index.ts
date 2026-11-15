// Fetches a public web page for Studio's "import a free curriculum" (browsers
// can't read other sites directly). Signed-in users only, within per-user
// limits kept in the database (claim_page_fetch()). Only public http(s)
// addresses on standard ports: the site's name is looked up once, every
// address it gives must be public, and the request goes to exactly that
// address (TLS still checks the site's own name), so the site can't switch
// to an internal address between the check and the fetch. Each redirect is
// checked the same way; there's a time and size limit.
// STUDIO_FETCH_ALLOW_PRIVATE=1 lifts the address check for local testing only.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';
import { charsetOf, checkUrl, ChunkedDecoder, isIpLiteral, limitMessage, parseHead, pinAddress, requestFor, type ResponseHead } from './net.ts';

// Whole books on one page (Project Gutenberg) run to several megabytes.
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 12000;
const HEADERS = { 'User-Agent': 'FreerangeStudio/1.0 (curriculum import)', Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8' };
const allowPrivate = () => Deno.env.get('STUDIO_FETCH_ALLOW_PRIVATE') === '1';

class Refused extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) return json({ error: 'Sign in to import from the web.' }, 401);

    const { url } = await req.json();
    if (typeof url !== 'string' || url.length > 2000) return json({ error: 'Enter a web address.' }, 400);
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return json({ error: 'That isn’t a web address.' }, 400);
    }

    // Every request counts, even ones that fail, so the limits can't be probed around.
    const { data: claim, error: claimError } = await admin.rpc('claim_page_fetch', { uid: auth.user.id });
    if (claimError) throw claimError;
    const limited = limitMessage(claim);
    if (limited) return new Response(JSON.stringify({ error: limited }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(claim.retry_after ?? 60) } });

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const address = await resolveTarget(target);
      const res = await get(target, address, deadline);
      if (res.head.status >= 300 && res.head.status < 400) {
        const next = res.head.headers.get('location');
        res.close();
        if (!next) return json({ error: 'The page redirected nowhere.' }, 502);
        target = new URL(next, target);
        continue;
      }
      if (res.head.status < 200 || res.head.status >= 300) {
        res.close();
        return json({ error: `That page answered ${res.head.status}.` }, 502);
      }
      const type = res.head.headers.get('content-type') ?? '';
      // JSON is for records like archive.org's book metadata and LibreTexts' book outlines.
      if (!/text\/html|application\/xhtml|text\/plain|application\/json/i.test(type)) {
        res.close();
        return json({ error: 'That address isn’t a web page (PDFs and files can be added to lessons as links instead).' }, 415);
      }
      const bytes = await res.body();
      return json({ url: target.href, html: new TextDecoder(charsetOf(type)).decode(bytes) });
    }
    return json({ error: 'Too many redirects.' }, 502);
  } catch (e) {
    if (e instanceof Refused) return json({ error: e.message }, e.status);
    const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    // Closing the connection at the deadline surfaces as a read error, so check the deadline itself too.
    return json({ error: deadline.aborted || /timed? ?out|abort/i.test(msg) ? 'That page took too long to load.' : 'Couldn’t load that page.' }, 502);
  }
});

/** The checked, pinned address to connect to for this URL. */
async function resolveTarget(u: URL): Promise<string> {
  const problem = checkUrl(u, allowPrivate());
  if (problem) throw new Refused(problem);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIpLiteral(host)) addresses = [host];
  else if (allowPrivate() && host === 'localhost') addresses = ['127.0.0.1'];
  else {
    const [a, aaaa] = await Promise.all([Deno.resolveDns(host, 'A').catch(() => [] as string[]), Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])]);
    addresses = [...a, ...aaaa];
  }
  const pin = pinAddress(addresses, allowPrivate());
  if ('problem' in pin) throw new Refused(pin.problem);
  return pin.address;
}

/**
 * GET over a connection to exactly `address`. HTTPS is started on that same
 * connection with the site's name, so the certificate is still checked
 * against the site the creator asked for.
 */
async function get(u: URL, address: string, signal: AbortSignal): Promise<{ head: ResponseHead; body: () => Promise<Uint8Array>; close: () => void }> {
  const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  const tcp = await Deno.connect({ hostname: address, port });
  let conn: Deno.Conn = tcp;
  const close = () => {
    try {
      conn.close();
    } catch {
      // Already closed.
    }
  };
  const onAbort = () => close();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (u.protocol === 'https:') conn = await Deno.startTls(tcp, { hostname: u.hostname.replace(/^\[|\]$/g, ''), alpnProtocols: ['http/1.1'] });
    await writeAll(conn, new TextEncoder().encode(requestFor(u, HEADERS)));
    const buf = new Uint8Array(64 * 1024);
    let pending = new Uint8Array(0);
    let head: ResponseHead | undefined;
    while (!head) {
      if (signal.aborted) throw new DOMException('timed out', 'TimeoutError');
      const n = await conn.read(buf);
      if (n === null) throw new Error('Connection closed before a response');
      pending = concat([pending, buf.subarray(0, n)]);
      head = parseHead(pending);
      // Skip "100 Continue" and other interim responses.
      if (head && head.status >= 100 && head.status < 200) {
        pending = pending.slice(head.bodyStart);
        head = undefined;
      }
    }
    const first = pending.slice(head.bodyStart);
    const h = head;
    const body = async () => {
      const chunked = /chunked/i.test(h.headers.get('transfer-encoding') ?? '');
      const length = Number(h.headers.get('content-length') ?? NaN);
      const decoder = chunked ? new ChunkedDecoder() : undefined;
      const parts: Uint8Array[] = [];
      let size = 0;
      const take = (bytes: Uint8Array) => {
        for (const p of decoder ? decoder.push(bytes) : [bytes]) {
          size += p.length;
          if (size > MAX_BYTES) return false;
          parts.push(p);
        }
        return !(decoder?.done || (!decoder && Number.isFinite(length) && size >= length));
      };
      let more = take(first);
      while (more) {
        if (signal.aborted) throw new DOMException('timed out', 'TimeoutError');
        const n = await conn.read(buf);
        if (n === null) break;
        more = take(buf.subarray(0, n));
      }
      close();
      let all = concat(parts);
      if (Number.isFinite(length) && !decoder) all = all.subarray(0, length);
      const encoding = (h.headers.get('content-encoding') ?? '').toLowerCase();
      if (encoding === 'gzip' || encoding === 'deflate') all = await inflate(all, encoding);
      else if (encoding && encoding !== 'identity') throw new Error(`Unsupported encoding ${encoding}`);
      return all.length > MAX_BYTES ? all.subarray(0, MAX_BYTES) : all;
    };
    return { head, body, close };
  } catch (e) {
    close();
    throw e;
  }
}

async function writeAll(conn: Deno.Conn, bytes: Uint8Array) {
  let at = 0;
  while (at < bytes.length) at += await conn.write(bytes.subarray(at));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

async function inflate(bytes: Uint8Array, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    parts.push(value);
  }
  return concat(parts);
}
