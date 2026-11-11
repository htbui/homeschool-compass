// Fetches a public web page for Studio's "import a free curriculum" (browsers
// can't read other sites directly). Signed-in users only. Only public http(s)
// addresses on standard ports; private, loopback, and link-local addresses are
// refused (each redirect is re-checked), with a time and size limit.
// STUDIO_FETCH_ALLOW_PRIVATE=1 lifts the address check for local testing only.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 12000;
const allowPrivate = () => Deno.env.get('STUDIO_FETCH_ALLOW_PRIVATE') === '1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
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

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const problem = await checkTarget(target);
      if (problem) return json({ error: problem }, 400);
      const res = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'FreerangeStudio/1.0 (curriculum import)', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        await res.body?.cancel();
        if (!next) return json({ error: 'The page redirected nowhere.' }, 502);
        target = new URL(next, target);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return json({ error: `That page answered ${res.status}.` }, 502);
      }
      const type = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
        await res.body?.cancel();
        return json({ error: 'That address isn’t a web page (PDFs and files can be added to lessons as links instead).' }, 415);
      }
      const html = await readLimited(res);
      return json({ url: target.href, html });
    }
    return json({ error: 'Too many redirects.' }, 502);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /timed? ?out|abort/i.test(msg) ? 'That page took too long to load.' : 'Couldn’t load that page.' }, 502);
  }
});

async function readLimited(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return new TextDecoder().decode(all);
}

/** Returns why this address can't be fetched, or undefined when it's fine. */
async function checkTarget(u: URL): Promise<string | undefined> {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only web pages (http or https) can be imported.';
  if (u.username || u.password) return 'Addresses with passwords can’t be imported.';
  if (allowPrivate()) return undefined;
  if (u.port && u.port !== '80' && u.port !== '443') return 'Only standard web ports can be imported.';
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return 'That address isn’t public.';
  let addrs: string[] = [];
  if (/^[\d.]+$/.test(host) || host.includes(':')) addrs = [host];
  else {
    try {
      const [a, aaaa] = await Promise.all([Deno.resolveDns(host, 'A').catch(() => []), Deno.resolveDns(host, 'AAAA').catch(() => [])]);
      addrs = [...a, ...aaaa];
    } catch {
      return 'Couldn’t look up that address.';
    }
    if (!addrs.length) return 'Couldn’t find that website.';
  }
  return addrs.some(isPrivate) ? 'That address isn’t public.' : undefined;
}

function isPrivate(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivate(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
