// Generic archive-scraping adapter, driven by per-source `config` in the
// registry. Fetches each configured archive/search page (a few pages deep),
// parses listing cards, and returns raw listings. Robust to per-site markup
// because it keys off the listing-URL pattern + surrounding card text.
//
// source.config = {
//   archives: [{ path: '/properties/', status: 'sale', pages?: 2 }, ...],
//   listingPattern: '/properties/[^/]+',   // regex source string
//   pages?: 2,                             // default pages per archive
// }
import { fetchHtml } from '../fetch.js';
import { parseArchive } from '../lib/scrape.js';

export async function fetchListings(source) {
  const cfg = source.config || {};
  const listingRe = new RegExp(cfg.listingPattern || '/(property|properties|listing|listings)/[^/]+', 'i');
  const defaultPages = cfg.pages || 2;
  const all = new Map();
  let firstError = null;

  for (const archive of cfg.archives || []) {
    const pages = archive.pages || defaultPages;
    for (let page = 1; page <= pages; page++) {
      const url = source.url.replace(/\/$/, '') + pageUrl(archive.path, page);
      let html;
      try {
        html = await fetchHtml(url);
      } catch (err) {
        if (page === 1 && !firstError) firstError = err; // record; keep trying others
        break;
      }
      const found = parseArchive(html, source.url.replace(/\/$/, ''), listingRe, archive.status || 'sale');
      if (found.length === 0) break;
      const before = all.size;
      for (const l of found) all.set(l.external_id, l);
      if (all.size === before) break; // page repeated or exhausted
    }
  }

  // Only surface an error if we found nothing at all — a partial success
  // (some archives worked) should still record the listings we got.
  if (all.size === 0 && firstError) throw firstError;
  return [...all.values()];
}

// WordPress archives paginate as /path/page/2/; query-string sites as ?page=2.
function pageUrl(path, page) {
  if (page === 1) return path;
  if (path.endsWith('/')) return `${path}page/${page}/`;
  return `${path}?page=${page}`;
}
