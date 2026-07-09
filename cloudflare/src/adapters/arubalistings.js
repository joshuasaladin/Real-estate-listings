// Adapter for https://arubalistings.com — itself an aggregator carrying many
// Aruban brokers, so our highest-coverage source. Parses defensively:
//   1. JSON-LD (schema.org) structured data (most reliable when present)
//   2. Heuristic card parsing (anchors to detail pages + surrounding text)
// If the site blocks or changes markup, the run records the error and every
// other source continues unaffected.
import * as cheerio from 'cheerio';
import { fetchHtml } from '../fetch.js';
import { parsePrice } from '../normalize.js';

const PAGES = [
  { path: '/sale/all', status: 'sale' },
  { path: '/rent/all', status: 'rent' },
];
const MAX_PAGINATION = 3; // kept low to share the Workers subrequest budget across all sources

export async function fetchListings(source) {
  const all = new Map();
  for (const { path, status } of PAGES) {
    for (let page = 1; page <= MAX_PAGINATION; page++) {
      const url = `${source.url}${path}${page > 1 ? `?page=${page}` : ''}`;
      let html;
      try {
        html = await fetchHtml(url);
      } catch (err) {
        if (page === 1) throw err;
        break;
      }
      const found = parsePage(html, source, status);
      if (found.length === 0) break;
      const before = all.size;
      for (const l of found) all.set(l.external_id, l);
      if (all.size === before) break;
    }
  }
  return [...all.values()];
}

function parsePage(html, source, status) {
  const $ = cheerio.load(html);
  return dedupeById([...parseJsonLd($, source, status), ...parseCards($, source, status)]);
}

function parseJsonLd($, source, status) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    for (const node of flattenLd(data)) {
      const type = String(node['@type'] || '');
      if (!/RealEstateListing|Product|Offer|House|Apartment|Residence|SingleFamilyResidence/i.test(type)) continue;
      const url = node.url || node.mainEntityOfPage;
      const name = node.name || node.headline;
      if (!url || !name) continue;
      const offer = node.offers || node;
      const geo = node.geo || node.spatialCoverage?.geo || {};
      out.push({
        external_id: absolute(url, source.url),
        url: absolute(url, source.url),
        title: name,
        description: node.description,
        price_amount: parseFloat(offer.price ?? offer.lowPrice),
        price_currency: offer.priceCurrency,
        price_raw: offer.price != null ? `${offer.priceCurrency || ''} ${offer.price}` : null,
        status,
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

function flattenLd(data, acc = []) {
  if (Array.isArray(data)) data.forEach((d) => flattenLd(d, acc));
  else if (data && typeof data === 'object') {
    acc.push(data);
    if (data['@graph']) flattenLd(data['@graph'], acc);
    if (data.itemListElement) flattenLd(data.itemListElement.map((e) => e.item || e), acc);
  }
  return acc;
}

function parseCards($, source, status) {
  const out = [];
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const abs = absolute(href, source.url);
    if (!abs.startsWith(source.url)) return;
    const path = new URL(abs).pathname;
    if (!/^\/(sale|rent|listing|property|properties)\/[^/]+/.test(path)) return;
    if (/\/(all|page|search)([/?]|$)/.test(path)) return;
    if (seen.has(abs)) return;

    const card = $(a).closest('article, li, .card, [class*="listing"], [class*="property"], div');
    const text = card.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const priceStr = (text.match(/(?:US\$|Afl\.?|AWG|\$|ƒ)\s?[\d.,]{4,}/i) || [])[0];
    const price = parsePrice(priceStr);
    const title =
      card.find('h1,h2,h3,h4,[class*="title"]').first().text().trim() ||
      $(a).attr('title') || $(a).text().trim();
    if (!title) return;
    seen.add(abs);
    out.push({
      external_id: abs,
      url: abs,
      title,
      price_amount: price?.amount,
      price_currency: price?.currency,
      price_raw: priceStr || null,
      status,
      bedrooms: (text.match(/(\d+)\s*(?:bed|bd|slaapkamer)/i) || [])[1],
      bathrooms: (text.match(/(\d+(?:\.\d)?)\s*(?:bath|ba\b|badkamer)/i) || [])[1],
      building_m2: (text.match(/([\d.,]+)\s*m²?\s*(?:build|living|construction)/i) || [])[1],
      lot_m2: (text.match(/([\d.,]+)\s*m²?\s*(?:lot|land|property)/i) || [])[1],
      images: card
        .find('img[src], img[data-src]')
        .map((_, img) => absolute($(img).attr('data-src') || $(img).attr('src'), source.url))
        .get()
        .filter((s) => /^https?:/.test(s))
        .slice(0, 5),
    });
  });
  return out;
}

function absolute(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return String(href);
  }
}

function dedupeById(listings) {
  const m = new Map();
  for (const l of listings) if (!m.has(l.external_id)) m.set(l.external_id, l);
  return [...m.values()];
}
