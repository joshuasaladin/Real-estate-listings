// Diagnostic probe. Because agency sites block our dev environment, we use the
// deployed Worker (on Cloudflare's network) to inspect them instead. Hit:
//   /api/probe?source=<id>   deep-probe one agency (see sources/registry.js)
//   /api/probe?url=<url>     probe an arbitrary URL
// Paste the JSON back so real adapters can be written against real structure.
// This endpoint only READS public pages and is meant for one-off diagnostics.
import { allSources } from './sources/registry.js';

// A realistic browser UA gets past naive user-agent filters so we can see what
// is actually reachable from Cloudflare. Used for diagnostics only.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CANDIDATE_PATHS = [
  '',
  '/robots.txt',
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/wp-sitemap.xml',
  '/wp-json/wp/v2/types',
  '/wp-json/wp/v2/property?per_page=2',
  '/wp-json/wp/v2/listing?per_page=2',
  '/wp-json/wp/v2/estate?per_page=2',
  '/wp-json/wp/v2/properties?per_page=2',
  '/properties',
  '/listings',
  '/property',
  '/for-sale',
  '/real-estate',
];

export async function handleProbe(url, env) {
  const q = url.searchParams;
  let targets = [];

  if (q.get('url')) {
    targets = [{ id: 'custom', name: 'custom', base: new URL(q.get('url')).origin, paths: [new URL(q.get('url')).pathname || ''] }];
  } else if (q.get('source')) {
    const s = allSources(env).find((x) => x.id === q.get('source'));
    if (!s) return json({ error: `unknown source '${q.get('source')}'`, known: allSources(env).map((x) => x.id) }, 404);
    targets = [{ id: s.id, name: s.name, base: new URL(s.url).origin, paths: CANDIDATE_PATHS }];
  } else {
    // No args: shallow reachability check of every source (homepage only).
    targets = allSources(env)
      .filter((s) => !s.demo)
      .map((s) => ({ id: s.id, name: s.name, base: new URL(s.url).origin, paths: [''] }));
  }

  const out = [];
  for (const t of targets) {
    const results = [];
    for (const p of t.paths) {
      results.push(await tryFetch(t.base + p));
      await sleep(250);
    }
    out.push({ id: t.id, name: t.name, base: t.base, results });
  }
  return json({ probedAt: new Date().toISOString(), targets: out }, 200);
}

async function tryFetch(u) {
  try {
    const res = await fetch(u, {
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html,application/xhtml+xml,application/json,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    return { url: u, status: res.status, finalUrl: res.url, contentType: ct, length: text.length, ...summarize(text, ct) };
  } catch (e) {
    return { url: u, status: 0, error: String(e.message || e) };
  }
}

function summarize(text, ct) {
  const out = {};
  const isXml = /xml/.test(ct) || text.includes('<urlset') || text.includes('<sitemapindex');
  const isJson = ct.includes('json') || /^\s*[[{]/.test(text);
  const isHtml = /html/.test(ct) || text.includes('<html') || text.includes('<!doctype');

  if (isXml) {
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    out.sitemapCount = locs.length;
    out.sitemapUrls = locs.slice(0, 40);
  } else if (isJson) {
    out.jsonHead = text.slice(0, 1200);
  } else if (isHtml) {
    out.title = (text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim();
    out.generator = (text.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1];
    out.hasJsonLd = text.includes('application/ld+json');
    const ld = [...text.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim().slice(0, 600));
    if (ld.length) out.jsonLdSamples = ld.slice(0, 3);
    const hrefs = [...text.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]);
    const listingLike = hrefs.filter((h) => /(listing|property|properties|for-sale|estate|woning|homes?)\/[^"'/][^"']*/i.test(h));
    out.listingLinkSamples = [...new Set(listingLike)].slice(0, 15);
    out.detectedWordPress = text.includes('/wp-content/') || text.includes('/wp-json/');
  }
  return out;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
