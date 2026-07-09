// Shared scraping helpers: parse an agency "archive" / search-results page into
// raw listing objects. Strategy per page:
//   1. schema.org JSON-LD (RealEstateListing / Product / Offer / Residence)
//   2. heuristic card parsing — anchors matching the site's listing-URL pattern,
//      with price/beds/baths/size pulled from the surrounding card text.
// Central normalization (currency, type/area inference) happens in normalize.js.
import * as cheerio from 'cheerio';
import { parsePrice } from '../normalize.js';

const PRICE_RE = /(?:US\$|USD|Afl\.?|AWG|ƒ|\$)\s?[\d.,]{3,}/i;

export function parseArchive(html, base, listingRe, defaultStatus) {
  const $ = cheerio.load(html);
  const byId = new Map();
  for (const l of parseJsonLd($, base, defaultStatus)) byId.set(l.external_id, l);
  for (const l of parseCards($, base, listingRe, defaultStatus)) {
    if (!byId.has(l.external_id)) byId.set(l.external_id, l);
  }
  return [...byId.values()];
}

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
        title: name,
        description: node.description,
        price_amount: parseFloat(offer.price ?? offer.lowPrice),
        price_currency: offer.priceCurrency,
        price_raw: offer.price != null ? `${offer.priceCurrency || ''} ${offer.price}` : null,
        status: /rent|rental/i.test(`${url} ${name}`) ? 'rent' : defaultStatus,
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

function parseCards($, base, listingRe, defaultStatus) {
  const out = [];
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const url = abs(href, base);
    if (!url.startsWith(base)) return;
    const path = new URL(url).pathname.replace(/\/$/, '');
    if (!listingRe.test(path)) return;
    // Skip archive/category index pages (they match the pattern loosely).
    if (/\/(all|page|search|category|for-sale|for-rent|rental|residential|commercial|condominium|land|luxury|sold)$/i.test(path)) return;
    if (seen.has(url)) return;

    const card = $(a).closest('article, li, .card, [class*="listing"], [class*="property"], [class*="card"], div');
    const text = card.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const priceStr = (text.match(PRICE_RE) || [])[0];
    const title =
      card.find('h1,h2,h3,h4,[class*="title"]').first().text().trim() ||
      $(a).attr('title') ||
      $(a).text().trim();
    if (!title || title.length < 3) return;
    seen.add(url);
    const price = parsePrice(priceStr);
    out.push({
      external_id: url,
      url,
      title: title.slice(0, 300),
      price_amount: price?.amount,
      price_currency: price?.currency,
      price_raw: priceStr || null,
      status: /rent|rental|per month|\/mo/i.test(text) || /rent|rental/i.test(path) ? 'rent' : defaultStatus,
      bedrooms: (text.match(/(\d+)\s*(?:beds?|bd|bedrooms?|slaapkamers?)/i) || [])[1],
      bathrooms: (text.match(/(\d+(?:\.\d)?)\s*(?:baths?|ba\b|bathrooms?|badkamers?)/i) || [])[1],
      building_m2: (text.match(/([\d.,]+)\s*m(?:2|²)\b/i) || [])[1],
      images: card
        .find('img[src], img[data-src], img[data-lazy-src]')
        .map((_, img) => abs($(img).attr('data-src') || $(img).attr('data-lazy-src') || $(img).attr('src'), base))
        .get()
        .filter((s) => /^https?:/.test(s) && !/logo|placeholder|blank|sprite/i.test(s))
        .slice(0, 5),
    });
  });
  return out;
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
