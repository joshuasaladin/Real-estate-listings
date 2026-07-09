// Deep-crawler adapter: discovers every listing URL from the site's sitemap
// and crawls listing DETAIL pages (richer than archive cards: full price,
// photos, description). Coverage builds incrementally across sync runs:
// new URLs are crawled first, then the stalest known ones are refreshed,
// within whatever subrequest budget remains this run. Sources using this
// adapter set `incremental: true` in the registry so sync rotates them
// (one per run) and prunes only against the full sitemap URL set.
//
// source.config = {
//   listingPattern: '/(sale|rent)/[^/]+',  // which URLs are listings
//   seedArchives?: [''],                   // index pages to card-harvest too
//   sitemaps?: ['/sitemap.xml'],           // candidates, first hit wins
//   defaultStatus?: 'sale',
//   batch?: number,                        // detail pages per run (default: adaptive)
// }
import { fetchHtml, remainingSubrequests } from '../fetch.js';
import { parseArchive } from '../lib/scrape.js';
import { parseDetail } from '../lib/detail.js';
import { listingSeen } from '../db.js';

const DEFAULT_SITEMAPS = ['/sitemap.xml', '/wp-sitemap.xml', '/sitemap_index.xml'];

export async function fetchListings(source, env) {
  const cfg = source.config || {};
  const base = source.url.replace(/\/$/, '');
  const listingRe = new RegExp(cfg.listingPattern, 'i');
  const status = cfg.defaultStatus || 'sale';
  const out = new Map();
  let seedError = null;

  // 1) Card-harvest seed archive pages for immediate shallow coverage.
  for (const p of cfg.seedArchives || []) {
    try {
      const html = await fetchHtml(base + p);
      for (const l of parseArchive(html, base, listingRe, status)) out.set(l.external_id, l);
    } catch (err) {
      if (!seedError) seedError = err;
    }
  }

  // 2) Discover the full listing URL set from the sitemap.
  let discovered = null;
  for (const sm of cfg.sitemaps || DEFAULT_SITEMAPS) {
    try {
      const urls = await readSitemap(base + sm);
      const matches = [...new Set(urls)].filter((u) => {
        try {
          return u.startsWith(base) && listingRe.test(new URL(u).pathname);
        } catch {
          return false;
        }
      });
      if (matches.length) {
        discovered = matches;
        break;
      }
    } catch {}
  }

  // 3) Crawl a batch of detail pages: unseen URLs first, then stalest.
  if (discovered) {
    const seen = await listingSeen(env, source.id);
    const unseen = discovered.filter((u) => !seen.has(u));
    const stale = discovered.filter((u) => seen.has(u)).sort((a, b) => (seen.get(a) < seen.get(b) ? -1 : 1));
    const batch = cfg.batch ?? Math.max(4, remainingSubrequests() - 6);
    let crawled = 0;
    for (const u of [...unseen, ...stale]) {
      if (crawled >= batch || remainingSubrequests() <= 4) break;
      crawled++;
      try {
        const l = parseDetail(await fetchHtml(u), u, status);
        if (l) out.set(l.external_id, l);
      } catch (err) {
        if (/subrequest budget/.test(String(err.message || err))) break;
      }
    }
  }

  if (out.size === 0 && !discovered) {
    throw seedError || new Error('no listings found: seed archives empty and no usable sitemap');
  }
  // knownIds = full URL set from the sitemap; sync prunes against it so
  // uncrawled-this-run listings stay active.
  return { listings: [...out.values()], knownIds: discovered ? new Set(discovered) : null };
}

async function readSitemap(url, depth = 0) {
  const xml = await fetchHtml(url);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const children = locs.filter((l) => /\.xml(\?|$)/i.test(l));
  if (children.length && depth < 1) {
    // Sitemap index: read the most listing-relevant child sitemaps.
    const relevant = children.filter((c) => /prop|listing|sale|rent|estate|post/i.test(c));
    const chosen = (relevant.length ? relevant : children).slice(0, 3);
    const all = [];
    for (const c of chosen) {
      try {
        all.push(...(await readSitemap(c, depth + 1)));
      } catch {}
    }
    return all;
  }
  return locs;
}
