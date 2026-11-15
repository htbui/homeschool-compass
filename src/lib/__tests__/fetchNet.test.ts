import { describe, expect, it } from 'vitest';

import { charsetOf, checkUrl, ChunkedDecoder, isPrivateAddress, limitMessage, parseHead, pinAddress, requestFor, v6 } from '../../../supabase/functions/fetch-page/net';

// fetch-page's pure helpers (the edge function itself runs on Deno).

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (parts: Uint8Array[]) => new TextDecoder().decode(Uint8Array.from(parts.flatMap((p) => [...p])));

describe('public addresses only', () => {
  it('refuses private, loopback, link-local, and reserved IPv4 ranges', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.10', '198.18.0.1', '203.0.113.9']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '93.184.216.34', '1.1.1.1']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('refuses IPv6 forms, including ones that carry an internal IPv4 address', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', 'fc12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '2001:db8::1', '2001:0:4136:e378::1', '[::1]', 'fe80::1%eth0']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:82a::200e', '::ffff:8.8.8.8', '2002:0808:0808::1']) expect(isPrivateAddress(ip), ip).toBe(false);
    expect(v6('2606:4700::1111')).toEqual([0x2606, 0x4700, 0, 0, 0, 0, 0, 0x1111]);
    expect(isPrivateAddress('not an address')).toBe(true);
    expect(isPrivateAddress('1::2::3')).toBe(true);
  });

  it('checks the address before looking anything up', () => {
    expect(checkUrl(new URL('ftp://example.org/a'))).toMatch(/http or https/);
    expect(checkUrl(new URL('https://me:pw@example.org/'))).toMatch(/passwords/);
    expect(checkUrl(new URL('https://example.org:8443/'))).toMatch(/standard web ports/);
    expect(checkUrl(new URL('http://localhost/'))).toMatch(/isn’t public/);
    expect(checkUrl(new URL('http://printer.local/'))).toMatch(/isn’t public/);
    expect(checkUrl(new URL('http://intranet/'))).toMatch(/isn’t public/);
    // Browsers' URL parsing turns these into 127.0.0.1 and ::1 first.
    expect(checkUrl(new URL('http://2130706433/'))).toMatch(/isn’t public/);
    expect(checkUrl(new URL('http://0x7f.1/'))).toMatch(/isn’t public/);
    expect(checkUrl(new URL('http://[::1]/'))).toMatch(/isn’t public/);
    expect(checkUrl(new URL('https://www.gutenberg.org/ebooks/3074'))).toBeUndefined();
    expect(checkUrl(new URL('http://localhost:54321/'), true)).toBeUndefined();
  });

  it('pins one looked-up address, refusing a name with any internal address', () => {
    expect(pinAddress(['93.184.216.34', '2606:2800:220:1::248'])).toEqual({ address: '93.184.216.34' });
    expect(pinAddress(['2606:2800:220:1::248'])).toEqual({ address: '2606:2800:220:1::248' });
    // A name answering with both a public and an internal address is refused outright.
    expect(pinAddress(['93.184.216.34', '10.0.0.5'])).toEqual({ problem: 'That address isn’t public.' });
    expect(pinAddress([])).toEqual({ problem: 'Couldn’t find that website.' });
    expect(pinAddress(['127.0.0.1'], true)).toEqual({ address: '127.0.0.1' });
  });
});

describe('HTTP over the pinned connection', () => {
  it('asks for the page by the site’s own name', () => {
    const req = requestFor(new URL('https://open.example.org/book/toc?x=1'), { 'User-Agent': 'FreerangeStudio/1.0', Accept: 'text/html\r\nEvil: 1' });
    expect(req.split('\r\n').slice(0, 5)).toEqual(['GET /book/toc?x=1 HTTP/1.1', 'Host: open.example.org', 'User-Agent: FreerangeStudio/1.0', 'Accept: text/htmlEvil: 1', 'Accept-Encoding: gzip, identity']);
    expect(req.endsWith('Connection: close\r\n\r\n')).toBe(true);
    expect(requestFor(new URL('http://127.0.0.1:54321/'), {}).split('\r\n')[1]).toBe('Host: 127.0.0.1:54321');
  });

  it('reads the status and headers once they have all arrived', () => {
    expect(parseHead(bytes('HTTP/1.1 200 OK\r\nContent-Ty'))).toBeUndefined();
    const top = 'HTTP/1.1 301 Moved Permanently\r\nLocation: /next\r\nSet-Cookie: a=1\r\nset-cookie: b=2\r\n\r\n';
    const head = parseHead(bytes(`${top}body`))!;
    expect(head.status).toBe(301);
    expect(head.headers.get('location')).toBe('/next');
    expect(head.headers.get('set-cookie')).toBe('a=1, b=2');
    expect(head.bodyStart).toBe(top.length);
    expect(() => parseHead(bytes('SSH-2.0-OpenSSH\r\n\r\n'))).toThrow(/Not an HTTP response/);
  });

  it('undoes chunked transfer encoding, however the bytes are split', () => {
    const wire = '4\r\nWiki\r\n6;ext=1\r\npedia \r\nE\r\nin \r\n\r\nchunks.\r\n0\r\nTrailer: x\r\n\r\n';
    const whole = new ChunkedDecoder();
    expect(text(whole.push(bytes(wire)))).toBe('Wikipedia in \r\n\r\nchunks.');
    expect(whole.done).toBe(true);
    const bit = new ChunkedDecoder();
    const out: Uint8Array[] = [];
    for (const ch of wire) out.push(...bit.push(bytes(ch)));
    expect(text(out)).toBe('Wikipedia in \r\n\r\nchunks.');
    expect(bit.done).toBe(true);
    expect(() => new ChunkedDecoder().push(bytes('zz\r\n'))).toThrow(/chunk size/);
  });

  it('decodes the page in the charset it names', () => {
    expect(charsetOf('text/html; charset=ISO-8859-1')).toBe('iso-8859-1');
    expect(charsetOf('text/html')).toBe('utf-8');
    expect(charsetOf('text/html; charset=made-up')).toBe('utf-8');
  });
});

describe('rate limits', () => {
  it('explain how long to wait', () => {
    expect(limitMessage({ ok: true })).toBeUndefined();
    expect(limitMessage({ ok: false, reason: 'minute', retry_after: 1 })).toBe('That’s a lot of pages in a minute. Try again in 1 second.');
    expect(limitMessage({ ok: false, reason: 'minute', retry_after: 42 })).toMatch(/42 seconds/);
    expect(limitMessage({ ok: false, reason: 'day', retry_after: 3600 })).toMatch(/Try again tomorrow/);
  });
});
