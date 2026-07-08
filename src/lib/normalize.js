import { CONFIG } from '../config.js';

export const PROPERTY_TYPES = [
  'house',
  'villa',
  'condo',
  'apartment',
  'land',
  'commercial',
  'timeshare',
];

export const AREAS = [
  'Noord',
  'Palm Beach',
  'Eagle Beach',
  'Malmok',
  'Tierra del Sol',
  'Oranjestad',
  'Paradera',
  'Santa Cruz',
  'Savaneta',
  'Pos Chiquito',
  'San Nicolas',
  'Tanki Leendert',
  'Ponton',
  'Bubali',
];

/** Convert any price to both USD and AWG using the fixed peg. */
export function toPrices(amount, currency) {
  if (amount == null || !(amount > 0)) return { price_usd: null, price_awg: null };
  const cur = (currency || 'USD').toUpperCase();
  if (cur === 'AWG' || cur === 'AFL') {
    return { price_usd: round2(amount / CONFIG.AWG_PER_USD), price_awg: round2(amount) };
  }
  // Treat anything else as USD (USD dominates Aruban listings).
  return { price_usd: round2(amount), price_awg: round2(amount * CONFIG.AWG_PER_USD) };
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Parse a price string like "US$ 1,250,000" or "Afl. 350.000" -> {amount, currency}. */
export function parsePrice(text) {
  if (!text) return null;
  const t = String(text);
  let currency = 'USD';
  if (/afl|awg|ƒ/i.test(t)) currency = 'AWG';
  // Strip everything but digits, dots and commas, then normalize separators.
  const numMatch = t.replace(/[^\d.,]/g, ' ').trim().split(/\s+/).sort((a, b) => b.length - a.length)[0];
  if (!numMatch) return null;
  let n = numMatch;
  // "1,250,000" or "1.250.000" -> group separators; "350000.50" -> decimal.
  if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(n)) {
    const lastSep = Math.max(n.lastIndexOf('.'), n.lastIndexOf(','));
    const tail = n.slice(lastSep + 1);
    if (tail.length <= 2) {
      n = n.slice(0, lastSep).replace(/[.,]/g, '') + '.' + tail;
    } else {
      n = n.replace(/[.,]/g, '');
    }
  } else {
    n = n.replace(/,/g, '');
  }
  const amount = parseFloat(n);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

/** Guess the property type from free text. */
export function guessType(text) {
  const t = (text || '').toLowerCase();
  if (/timeshare|time-share/.test(t)) return 'timeshare';
  if (/\bcondo(minium)?\b/.test(t)) return 'condo';
  if (/\bapartment|\bapt\b|studio/.test(t)) return 'apartment';
  if (/\bvilla\b/.test(t)) return 'villa';
  if (/\bland\b|\blot\b|property lot|building lot/.test(t)) return 'land';
  if (/commercial|office|retail|restaurant|hotel\b/.test(t)) return 'commercial';
  if (/\bhouse|home\b|residence/.test(t)) return 'house';
  return 'house';
}

/** Guess the Aruban area/district from free text. */
export function guessArea(text) {
  const t = (text || '').toLowerCase();
  for (const area of AREAS) {
    if (t.includes(area.toLowerCase())) return area;
  }
  return null;
}

/**
 * Normalize a raw adapter result into the canonical Listing shape.
 * Adapters may return partial data; nulls are fine everywhere except
 * external_id, url and title.
 */
export function normalizeListing(raw, source) {
  if (!raw || !raw.external_id || !raw.url || !raw.title) return null;
  const prices = toPrices(raw.price_amount, raw.price_currency);
  return {
    source_id: source.id,
    external_id: String(raw.external_id),
    url: raw.url,
    title: String(raw.title).trim().slice(0, 300),
    description: raw.description ? String(raw.description).trim().slice(0, 5000) : null,
    price_usd: prices.price_usd,
    price_awg: prices.price_awg,
    price_raw: raw.price_raw || null,
    status: raw.status === 'rent' ? 'rent' : 'sale',
    type: PROPERTY_TYPES.includes(raw.type) ? raw.type : guessType(`${raw.title} ${raw.description || ''}`),
    area: raw.area || guessArea(`${raw.title} ${raw.address || ''} ${raw.description || ''}`),
    address: raw.address || null,
    lat: Number.isFinite(raw.lat) ? raw.lat : null,
    lng: Number.isFinite(raw.lng) ? raw.lng : null,
    bedrooms: toInt(raw.bedrooms),
    bathrooms: toNum(raw.bathrooms),
    building_m2: toNum(raw.building_m2),
    lot_m2: toNum(raw.lot_m2),
    images: JSON.stringify(Array.isArray(raw.images) ? raw.images.slice(0, 20) : []),
  };
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
