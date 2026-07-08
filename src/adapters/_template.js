// ============================================================================
// ADAPTER TEMPLATE — copy this file to write a new source adapter.
//
// Contract: export an async `fetchListings(source)` that returns an array of
// raw listing objects. Only external_id, url and title are required; fill in
// whatever else the source exposes. Normalization (currency conversion, type
// and area guessing, clamping) happens centrally in src/lib/normalize.js.
//
// Use politeFetch/fetchHtml from src/lib/fetch.js — it honors robots.txt,
// rate-limits per host, and sends our descriptive user-agent.
// Prefer an official API, RSS feed or sitemap over HTML scraping when the
// source offers one.
// ============================================================================
import * as cheerio from 'cheerio';
import { fetchHtml } from '../lib/fetch.js';
import { parsePrice } from '../lib/normalize.js';

export async function fetchListings(source) {
  const html = await fetchHtml(`${source.url}/properties-for-sale`);
  const $ = cheerio.load(html);
  const listings = [];

  $('.property-card').each((_, el) => {
    const $el = $(el);
    const href = new URL($el.find('a').attr('href'), source.url).href;
    const price = parsePrice($el.find('.price').text());
    listings.push({
      external_id: href, // any stable per-listing key; the URL usually works
      url: href,
      title: $el.find('.title').text().trim(),
      price_amount: price?.amount,
      price_currency: price?.currency,
      price_raw: $el.find('.price').text().trim(),
      status: 'sale', // or 'rent'
      // Optional fields:
      // type, area, address, lat, lng, bedrooms, bathrooms,
      // building_m2, lot_m2, images: [...], description
    });
  });

  return listings;
}
