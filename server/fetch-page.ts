import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Server-side link fetch for context chips (Build PRD 8, safety rules).
// http and https only, no private or loopback addresses, 8 s timeout, 1 MB cap, at most 3 redirects.

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const MAX_TEXT = 6000;

export class FetchError extends Error {}

function privateV4(ip: string) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
function privateV6(ip: string) {
  const x = ip.toLowerCase();
  if (x === '::1' || x === '::') return true;
  if (x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  return mapped ? privateV4(mapped[1]) : false;
}
const isPrivate = (ip: string) => (isIP(ip) === 4 ? privateV4(ip) : privateV6(ip));

async function assertPublic(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('Only http and https links can be read.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new FetchError('That address is private, so it cannot be read.');
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new FetchError('That site could not be found.');
  if (addrs.some((a) => isPrivate(a.address))) throw new FetchError('That address is private, so it cannot be read.');
}

/** Fetch a page and return its title and readable text (trimmed to about 6,000 characters). */
export async function fetchPage(raw: string): Promise<{ title: string; text: string; url: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchError('That does not look like a link.');
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; prototype-context-reader)', Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
    }).catch((e) => {
      throw new FetchError(e?.name === 'TimeoutError' ? 'The page took too long to answer.' : 'The page could not be reached.');
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new FetchError('The page redirected without saying where.');
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new FetchError(`The page answered with an error (${res.status}).`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new FetchError('That link is not a web page with text.');
    const body = await readCapped(res);
    const { title, text } = type.includes('text/plain') ? { title: url.hostname, text: body } : extract(body);
    if (text.trim().length < 80) throw new FetchError('The page has too little readable text.');
    return { title: title || url.hostname, text: text.slice(0, MAX_TEXT), url: url.toString() };
  }
  throw new FetchError('The page redirected too many times.');
}

async function readCapped(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break; // keep what fits; the text is trimmed anyway
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '-', ndash: '-', hellip: '...' };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

/** Strip scripts and markup and keep the readable text. Prefers <article> or <main> when present. */
function extract(html: string) {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim()).replace(/\s+/g, ' ');
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form)[\s\S]*?<\/\1>/gi, ' ');
  const main = /<(article|main)[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  if (main && main.length > 500) body = main;
  const text = decode(
    body
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return { title, text };
}
