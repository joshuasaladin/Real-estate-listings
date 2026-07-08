// ADAPTER TEMPLATE (Cloudflare build) — copy this to add a new source.
//
// Contract: export async `fetchListings(source)` returning an array of raw
// listing objects. Only external_id, url and title are required; fill in
// whatever else the source exposes. Central normalization (currency, type/area
// inference, clamping) happens in ../normalize.js.
//
// Use fetchHtml from ../fetch.js — it honors robots.txt, rate-limits per host,
// and sends our descriptive user-agent. Prefer an API/RSS/sitemap over HTML
// scraping when the source offers one.
import * as cheerio from 'cheerio';
import { fetchHtml } from '../fetch.js';
import { parsePrice } from '../normalize.js';

export async function fetchListings(source) {
  const html = await fetchHtml(`${source.url}/properties-for-sale`);
  const $ = cheerio.load(html);
  const listings = [];

  $('.property-card').each((_, el) => {
    const $el = $(el);
    const href = new URL($el.find('a').attr('href'), source.url).href;
    const price = parsePrice($el.find('.price').text());
    listings.push({
      external_id: href,
      url: href,
      title: $el.find('.title').text().trim(),
      price_amount: price?.amount,
      price_currency: price?.currency,
      price_raw: $el.find('.price').text().trim(),
      status: 'sale', // or 'rent'
      // Optional: type, area, address, lat, lng, bedrooms, bathrooms,
      // building_m2, lot_m2, images: [...], description
    });
  });

  return listings;
}
