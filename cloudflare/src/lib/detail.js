// Parse a single listing DETAIL page into one raw listing. Detail pages are
// far richer than archive cards: JSON-LD, og: meta tags, an h1, a gallery.
import * as cheerio from 'cheerio';
import { parsePrice } from '../normalize.js';

const PRICE_RE = /(?:US\$|USD|Afl\.?|AWG|ƒ|\$)\s?[\d][\d.,]{2,}/i;

export function parseDetail(html, url, defaultStatus) {
  const $ = cheerio.load(html);

  // JSON-LD node describing the property, if present.
  let ld = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (ld) return;
    try {
      for (const node of flatten(JSON.parse($(el).text()))) {
        if (/RealEstateListing|Product|House|Apartment|Residence|SingleFamilyResidence|Accommodation|Offer/i.test(String(node['@type'] || ''))) {
          ld = node;
          return;
        }
      }
    } catch {}
  });

  const og = (p) => $(`meta[property="og:${p}"], meta[name="og:${p}"]`).attr('content');
  const title = clean(ld?.name || og('title') || $('h1').first().text());
  if (!title || title.length < 4) return null;

  const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 9000);
  const offer = ld?.offers || {};
  let price = null;
  let priceRaw = null;
  if (offer.price) {
    price = { amount: parseFloat(offer.price), currency: offer.priceCurrency || 'USD' };
    priceRaw = `${offer.priceCurrency || ''} ${offer.price}`.trim();
  } else {
    const priceEl = $('[class*="price"], [id*="price"]').first().text();
    priceRaw = (priceEl.match(PRICE_RE) || bodyText.match(PRICE_RE) || [])[0] || null;
    price = parsePrice(priceRaw);
  }

  const geo = ld?.geo || {};
  const images = [
    ...[].concat(ld?.image || []).map((i) => (typeof i === 'string' ? i : i?.url)),
    og('image'),
    ...$('img')
      .map((_, img) => $(img).attr('data-src') || $(img).attr('src'))
      .get(),
  ]
    .filter(Boolean)
    .map((s) => abs(s, url))
    .filter((s) => /^https?:/.test(s) && !/logo|placeholder|blank|sprite|avatar|icon|captcha/i.test(s));

  return {
    external_id: url,
    url,
    title: title.slice(0, 300),
    description: clean(ld?.description || og('description') || '').slice(0, 5000) || undefined,
    price_amount: price?.amount,
    price_currency: price?.currency,
    price_raw: priceRaw,
    status: detectStatus(url, title, bodyText, defaultStatus),
    address: typeof ld?.address === 'string' ? ld.address : ld?.address?.addressLocality,
    lat: parseFloat(geo.latitude),
    lng: parseFloat(geo.longitude),
    bedrooms:
      ld?.numberOfBedrooms ?? ld?.numberOfRooms ??
      (bodyText.match(/(\d+)\s*(?:bed(?:room)?s?|bd|slaapkamers?)(?![a-z])/i) || [])[1] ??
      (bodyText.match(/bedrooms?\s*:?\s*(\d+)/i) || [])[1],
    bathrooms:
      ld?.numberOfBathroomsTotal ??
      (bodyText.match(/(\d+(?:\.\d)?)\s*(?:bath(?:room)?s?|ba|badkamers?)(?![a-z])/i) || [])[1] ??
      (bodyText.match(/bathrooms?\s*:?\s*(\d+(?:\.\d)?)/i) || [])[1],
    building_m2: ld?.floorSize?.value ?? (bodyText.match(/([\d.,]+)\s*m(?:2|²)(?![a-z0-9])/i) || [])[1],
    images: [...new Set(images)].slice(0, 8),
  };
}

function detectStatus(url, title, text, defaultStatus) {
  const strong = `${url} ${title}`.toLowerCase();
  if (/for-rent|for rent|rental|\brent\b|huur/.test(strong)) return 'rent';
  if (/for-sale|for sale|\bsale\b|koop/.test(strong)) return 'sale';
  if (text && /\bfor rent\b|per month|\/\s*mo(nth)?\b|p\/m/i.test(text.slice(0, 3000))) return 'rent';
  return defaultStatus;
}

function clean(t) {
  if (!t) return '';
  t = String(t);
  if (t.includes('<')) {
    const alt = t.match(/alt="([^"]{5,})"/);
    t = alt ? alt[1] : t.replace(/<[^>]*>/g, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
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

function abs(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return String(href);
  }
}
