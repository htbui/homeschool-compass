import { describe, expect, it } from 'vitest';

import { charsetOf, checkUrl, ChunkedDecoder, isIpLiteral, isPrivateAddress, limitMessage, parseHead, pinAddress, requestFor } from '../../../supabase/functions/fetch-page/net';

// Studio & Community: fetch-page's address checks and pinning, beyond the
// basics in fetchNet.test.ts.

const bytes = (s: string) => new TextEncoder().encode(s);

describe('address checks', () => {
  it('a trailing dot doesn’t sneak internal names past the check', () => {
    for (const u of ['http://localhost./', 'http://printer.local./', 'http://intranet./', 'http://LOCALHOST/', 'http://db.internal/', 'http://router.lan/', 'http://nas.home.arpa/', 'http://app.localhost/']) {
      expect(checkUrl(new URL(u)), u).toBe('That address isn’t public.');
    }
  });

  it('refuses internal IPs however they’re written in the address', () => {
    for (const u of ['http://127.1/', 'http://0177.0.0.1/', 'http://[::ffff:169.254.169.254]/', 'http://[0:0:0:0:0:ffff:7f00:1]/', 'http://0/', 'http://[fec0::1]/', 'http://10.0.0.1:80/', 'http://169.254.169.254:443/latest']) {
      expect(checkUrl(new URL(u)), u).toBe('That address isn’t public.');
    }
  });

  it('accepts public sites on standard ports, written either way', () => {
    for (const u of ['https://en.wikibooks.org/wiki/Arithmetic', 'http://example.org:80/', 'https://example.org:443/x', 'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/']) {
      expect(checkUrl(new URL(u)), u).toBeUndefined();
    }
  });

  it('refuses other ports and passwords even for public sites; local testing lifts only the address rules', () => {
    expect(checkUrl(new URL('https://example.org:22/'))).toMatch(/standard web ports/);
    expect(checkUrl(new URL('https://user@example.org/'))).toMatch(/passwords/);
    expect(checkUrl(new URL('https://user@localhost:3000/'), true)).toMatch(/passwords/);
    expect(checkUrl(new URL('file:///etc/passwd'), true)).toMatch(/http or https/);
  });

  it('knows IP literals from names', () => {
    expect(isIpLiteral('1.2.3.4')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('example.org')).toBe(false);
    expect(isIpLiteral('1.2.3')).toBe(false);
  });

  it('treats edge ranges correctly', () => {
    expect(isPrivateAddress('100.63.255.255')).toBe(false);
    expect(isPrivateAddress('100.64.0.0')).toBe(true);
    expect(isPrivateAddress('198.51.100.7')).toBe(true);
    expect(isPrivateAddress('198.20.0.1')).toBe(false);
    expect(isPrivateAddress('223.255.255.255')).toBe(false);
    expect(isPrivateAddress('256.1.1.1')).toBe(true);
    expect(isPrivateAddress('::ffff:93.184.216.34')).toBe(false);
  });
});

describe('pinning', () => {
  it('uses the first IPv4 address even when IPv6 is listed first', () => {
    expect(pinAddress(['2606:2800:220:1::248', '93.184.216.34'])).toEqual({ address: '93.184.216.34' });
  });

  it('refuses a name whose IPv6 answer is internal, even with a public IPv4 one', () => {
    expect(pinAddress(['93.184.216.34', '::1'])).toEqual({ problem: 'That address isn’t public.' });
    expect(pinAddress(['93.184.216.34', 'fd00::5'])).toEqual({ problem: 'That address isn’t public.' });
  });
});

describe('the request and response', () => {
  it('asks for the root when there is no path and keeps the query', () => {
    expect(requestFor(new URL('https://example.org?x=1'), {}).split('\r\n')[0]).toBe('GET /?x=1 HTTP/1.1');
  });

  it('refuses a response head bigger than 64 KB', () => {
    expect(() => parseHead(bytes(`HTTP/1.1 200 OK\r\nX: ${'a'.repeat(70 * 1024)}`))).toThrow();
  });

  it('the chunked decoder stops at the last chunk and ignores what follows', () => {
    const d = new ChunkedDecoder();
    const out = d.push(bytes('3\r\nabc\r\n0\r\n\r\nGARBAGE'));
    expect(new TextDecoder().decode(out[0])).toBe('abc');
    expect(d.done).toBe(true);
  });

  it('reads charsets in quotes and any case', () => {
    expect(charsetOf('text/html; charset="Windows-1252"')).toBe('windows-1252');
    expect(charsetOf('application/json')).toBe('utf-8');
  });

  it('rate-limit messages round the wait and never say zero seconds', () => {
    expect(limitMessage({ ok: false, reason: 'minute', retry_after: 59.4 })).toMatch(/59 seconds/);
    expect(limitMessage({ ok: false, reason: 'minute', retry_after: 0 })).toMatch(/1 second\./);
    expect(limitMessage({ ok: false, reason: 'minute' })).toMatch(/60 seconds/);
  });
});
