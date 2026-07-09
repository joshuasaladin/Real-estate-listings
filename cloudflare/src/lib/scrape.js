// Shared scraping helpers: parse an agency "archive" / search-results page into
// raw listing objects. Strategy per page:
//   1. schema.org JSON-LD (RealEstateListing / Product / Offer / Residence)
//   2. heuristic card parsing — anchors matching the site's listing-URL
//      pattern; the "card" is found by walking UP from the anchor to the
//      largest ancestor that still contains only this one listing URL, which
//      reliably isolates one listing card across very different themes.
// Titles are sanitized (lazy-load themes leak raw <img> markup), with the URL
// slug as a always-available fallback. Prices prefer price-classed elements.
import * as cheerio from 'cheerio';
import { parsePrice } from '../normalize.js';

const PRICE_RE = /(?:US\$|USD|Afl\.?|AWG|ƒ|\$)\s?[\d][\d.,]{2,}/i;

export function parseArchive(html, base, listingRe, defaultStatus) {
  const $ = cheerio.load(html);
  const byId = new Map();
  for (const l of parseJsonLd($, base, defaultStatus)) byId.set(l.external_id, l);
  for (const l of parseCards($, base, listingRe, defaultStatus)) {
    if (!byId.has(l.external_id)) byId.set(l.external_id, l);
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Strategy 1: schema.org JSON-LD
// ---------------------------------------------------------------------------
function parseJsonLd($, base, defaultStatus) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    for (const node of flatten(data)) {
      const type = String(node['@type'] || '');
      if (!/RealEstateListing|Product|Offer|House|Apartment|Residence|SingleFamilyResidence|Accommodation/i.test(type)) continue;
      const url = node.url || node.mainEntityOfPage;
      const name = node.name || node.headline;
      if (!url || !name) continue;
      const offer = node.offers || node;
      const geo = node.geo || node.spatialCoverage?.geo || {};
      out.push({
        external_id: abs(url, base),
        url: abs(url, base),
        title: cleanTitle(name),
        description: node.description,
        price_amount: parseFloat(offer.price ?? offer.lowPrice),
        price_currency: offer.priceCurrency,
        price_raw: offer.price != null ? `${offer.priceCurrency || ''} ${offer.price}` : null,
        status: detectStatus(url, name, null, defaultStatus),
        address: typeof node.address === 'string' ? node.address : node.address?.addressLocality,
        lat: parseFloat(geo.latitude),
        lng: parseFloat(geo.longitude),
        bedrooms: node.numberOfRooms ?? node.numberOfBedrooms,
        bathrooms: node.numberOfBathroomsTotal,
        building_m2: node.floorSize?.value,
        images: [].concat(node.image || []).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean),
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Strategy 2: heuristic card parsing
// ---------------------------------------------------------------------------
function parseCards($, base, listingRe, defaultStatus) {
  // Group all anchors by listing URL first, then find each listing's card.
  const anchorsByUrl = new Map();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const url = abs(href, base);
    if (!url.startsWith(base)) return;
    let path;
    try {
      path = new URL(url).pathname.replace(/\/$/, '');
    } catch {
      return;
    }
    if (!listingRe.test(path)) return;
    // Skip archive/category index pages that loosely match the pattern.
    if (/\/(all|page|search|category|for-sale|for-rent|rental|residential|commercial|condominium|land|luxury|sold)$/i.test(path)) return;
    if (!anchorsByUrl.has(url)) anchorsByUrl.set(url, []);
    anchorsByUrl.get(url).push(a);
  });

  const out = [];
  for (const [url, anchors] of anchorsByUrl) {
    const card = pickCard($, anchors[0], base, listingRe);
    const text = card ? card.text().replace(/\s+/g, ' ').trim() : '';
    const title = extractTitle($, card, anchors, url);
    if (!title) continue;

    // Price: prefer explicitly price-classed elements, then any match in text.
    let priceStr = null;
    if (card) {
      const priceEl = card.find('[class*="price"], [class*="Price"]').first().text();
      priceStr = (priceEl.match(PRICE_RE) || text.match(PRICE_RE) || [])[0] || null;
      if (!priceStr && priceEl.trim()) priceStr = priceEl.trim().slice(0, 40);
    }
    const price = parsePrice(priceStr);

    out.push({
      external_id: url,
      url,
      title,
      price_amount: price?.amount,
      price_currency: price?.currency,
      price_raw: priceStr,
      status: detectStatus(url, title, text, defaultStatus),
      bedrooms:
        (text.match(/(\d+)\s*(?:bed(?:room)?s?|bd|slaapkamers?)(?![a-z])/i) || [])[1] ??
        (text.match(/bedrooms?\s*:?\s*(\d+)/i) || [])[1],
      bathrooms:
        (text.match(/(\d+(?:\.\d)?)\s*(?:bath(?:room)?s?|ba|badkamers?)(?![a-z])/i) || [])[1] ??
        (text.match(/bathrooms?\s*:?\s*(\d+(?:\.\d)?)/i) || [])[1],
      building_m2: (text.match(/([\d.,]+)\s*m(?:2|²)(?![a-z0-9])/i) || [])[1],
      images: card ? extractImages($, card, base) : [],
    });
  }
  return out;
}

/**
 * Walk up from the anchor to the largest ancestor containing exactly one
 * listing URL — that ancestor is the listing's card, across most themes.
 */
function pickCard($, a, base, listingRe) {
  let el = $(a);
  let best = $(a).parent();
  for (let i = 0; i < 8; i++) {
    el = el.parent();
    if (!el.length || el.is('body,html')) break;
    const urls = new Set();
    el.find('a[href]').each((_, x) => {
      const u = abs($(x).attr('href'), base);
      if (!u.startsWith(base)) return;
      try {
        const p = new URL(u).pathname.replace(/\/$/, '');
        // Count this pattern's URLs AND any generically listing-like URL, so
        // we stop at list containers even when siblings use another pattern.
        const listingLike = listingRe.test(p) || /\/(sale|rent|property|properties|listing|listings)\/[^/]+/i.test(p);
        if (listingLike && !/\/(all|page|search|category|for-sale|for-rent|rental|residential|commercial|condominium|land|luxury|sold)$/i.test(p)) {
          urls.add(u);
        }
      } catch {}
    });
    if (urls.size > 1) break; // grew past this listing's card
    // Cards are compact; a huge text block means we've reached a page/list
    // container that just happens to hold only one pattern-matching link.
    if (el.text().replace(/\s+/g, ' ').trim().length > 900) break;
    best = el;
  }
  return best;
}

function extractTitle($, card, anchors, url) {
  const candidates = [];
  if (card) candidates.push(card.find('h1,h2,h3,h4,h5,[class*="title"],[class*="Title"]').first().text());
  for (const a of anchors) {
    candidates.push($(a).attr('title'), $(a).text());
    // Lazy-load themes often keep the only human text in the image alt.
    candidates.push($(a).find('img[alt]').attr('alt'));
  }
  if (card) {
    card.find('img[alt]').each((_, i) => candidates.push($(i).attr('alt')));
  }
  candidates.push(slugTitle(url)); // always-available fallback
  for (const raw of candidates) {
    const t = cleanTitle(raw);
    if (
      t &&
      t.length >= 5 &&
      t.length <= 200 &&
      !/[<>]|src=|https?:/i.test(t) &&
      !/^(view|read more|details?|more info|learn more|home|properties|for sale|for rent)$/i.test(t)
    ) {
      return t;
    }
  }
  return null;
}

/** Strip leaked markup; if the string IS markup, salvage the alt text. */
function cleanTitle(t) {
  if (!t) return '';
  t = String(t);
  if (t.includes('<')) {
    const alt = t.match(/alt="([^"]{5,})"/);
    t = alt ? alt[1] : t.replace(/<[^>]*>/g, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function slugTitle(url) {
  try {
    const seg = decodeURIComponent(new URL(url).pathname.replace(/\/$/, '').split('/').pop());
    const words = seg.replace(/[-_]+/g, ' ').trim();
    if (!words || /^\d+$/.test(words)) return null;
    return words.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return null;
  }
}

function detectStatus(url, title, cardText, defaultStatus) {
  const strong = `${url} ${title}`.toLowerCase();
  if (/for-rent|for rent|rental|\brent\b|huur/.test(strong)) return 'rent';
  if (/for-sale|for sale|\bsale\b|koop/.test(strong)) return 'sale';
  if (cardText && /\bfor rent\b|\/\s*mo(nth)?\b|per month|p\/m/i.test(cardText)) return 'rent';
  return defaultStatus;
}

function extractImages($, card, base) {
  const urls = [];
  card.find('img').each((_, img) => {
    const srcset = $(img).attr('srcset') || $(img).attr('data-srcset');
    const first = srcset ? srcset.split(',')[0].trim().split(/\s+/)[0] : null;
    for (const cand of [$(img).attr('data-src'), $(img).attr('data-lazy-src'), first, $(img).attr('src')]) {
      if (cand) {
        urls.push(abs(cand, base));
        break;
      }
    }
  });
  // CSS background-image cards (common for slider/tile themes).
  card.find('[style*="background"]').each((_, el) => {
    const m = ($(el).attr('style') || '').match(/url\(["']?([^"')]+)["']?\)/i);
    if (m) urls.push(abs(m[1], base));
  });
  return [...new Set(urls)]
    .filter((s) => /^https?:/.test(s) && !/logo|placeholder|blank|sprite|avatar|icon/i.test(s))
    .slice(0, 5);
}

function flatten(data, acc = []) {
  if (Array.isArray(data)) data.forEach((d) => flatten(d, acc));
  else if (data && typeof data === 'object') {
    acc.push(data);
    if (data['@graph']) flatten(data['@graph'], acc);
    if (data.itemListElement) flatten(data.itemListElement.map((e) => e.item || e), acc);
  }
  return acc;
}

export function abs(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return String(href);
  }
}
