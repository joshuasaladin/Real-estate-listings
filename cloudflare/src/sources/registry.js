// Registry of every real estate company in Aruba.
//
// Adapter types:
//  - generic:  card-harvests archive/index pages every 4-hour cycle (cheap)
//  - crawler:  discovers ALL listing URLs via the site's sitemap and crawls
//              detail pages; marked `incremental: true` so sync rotates one
//              per cycle and coverage accumulates run over run
//  - (none):   shown in the site's agency directory as "not synced yet"
//
// URL patterns below were verified via the /api/probe endpoint from
// Cloudflare's own network.
import { isDemo } from '../config.js';
import * as generic from '../adapters/generic.js';
import * as crawler from '../adapters/crawler.js';
import * as demo from '../adapters/demo.js';

const BASE = [
  {
    // Aggregator covering many brokers — the deepest single source, so it
    // deep-crawls EVERY cycle (priority) instead of rotating. Its robots.txt
    // disallows the /sale/all search pages (respected); the sitemap +
    // homepage are used instead. Sale listings only.
    id: 'arubalistings', name: 'Aruba Listings', url: 'https://arubalistings.com',
    adapter: crawler, incremental: true, priority: true,
    config: {
      listingPattern: '/sale/[^/]+',
      seedArchives: [''],
      batch: 14,
    },
  },
  {
    // OctoberCMS; /property archive 404s but detail URLs are /property/<slug>.
    id: 'mpgaruba', name: 'MPG Aruba Real Estate', url: 'https://www.mpgaruba.com',
    adapter: crawler, incremental: true,
    config: {
      listingPattern: '/property/[^/]+',
      seedArchives: [''],
    },
  },
  {
    id: 'coldwellbanker', name: 'Coldwell Banker Aruba Realty', url: 'https://www.coldwellbanker.aw',
    adapter: crawler, incremental: true,
    config: {
      listingPattern: '/(property|properties|listing|listings|details?|real-estate)/[^/]+',
      seedArchives: [''],
    },
  },
  {
    // Global JS platform; Aruba listings not separable via sitemap — needs a
    // partnership/feed. Directory-only for now.
    id: 'sothebys', name: "Aruba Sotheby's International Realty", url: 'https://www.sothebysrealty.com/eng/sales/abw',
  },
  {
    id: 'bhhsaruba', name: 'Berkshire Hathaway HomeServices Aruba Realty', url: 'https://www.bhhsaruba.com',
    adapter: crawler, incremental: true,
    config: {
      listingPattern: '/(property|properties|listing|listings|homes?|real-estate)/[^/]+',
      seedArchives: [''],
    },
  },
  {
    id: 'arubapalms', name: 'Aruba Palms Realtors', url: 'https://arubapalmsrealtors.com',
    adapter: generic,
    config: {
      listingPattern: '/properties/[^/]+',
      archives: [{ path: '/properties/', status: 'sale', pages: 3 }],
    },
  },
  {
    id: 'arubabrokers', name: 'Aruba Brokers', url: 'https://www.arubabrokers.com',
    adapter: generic,
    config: {
      listingPattern: '/property/[^/]+',
      archives: [{ path: '/property/', status: 'sale', pages: 3 }],
    },
  },
  {
    // Category pages are JS-rendered; the homepage carries server-rendered
    // /property/details/ links.
    id: 'remaxaruba', name: 'RE/MAX Aruba', url: 'https://remaxaruba.com',
    adapter: generic,
    config: {
      listingPattern: '/property/details/[^/]+',
      archives: [
        { path: '', status: 'sale', pages: 1 },
        { path: '/property/residential-for-sale', status: 'sale', pages: 1 },
        { path: '/property/condominium-for-sale', status: 'sale', pages: 1 },
        { path: '/property/land-for-sale', status: 'sale', pages: 1 },
      ],
    },
  },
  {
    id: 'bluefin', name: 'Bluefin Realtors', url: 'https://bluefinrealtors.com',
    adapter: generic,
    config: {
      listingPattern: '/property/[^/]+',
      archives: [{ path: '/property/', status: 'sale', pages: 3 }],
    },
  },
  {
    id: 'associatedrealtors', name: 'Associated Realtors Aruba', url: 'https://associatedrealtorsaruba.com',
    adapter: generic,
    config: {
      listingPattern: '/property/[^/]+',
      archives: [{ path: '/property/', status: 'sale', pages: 3 }],
    },
  },
  {
    // Behind a bot challenge ("Just a moment…") even from Cloudflare's
    // network. Needs a feed/partnership. Directory-only.
    id: 'buyersagent', name: "Buyer's Agent Aruba", url: 'https://buyersagentaruba.com',
  },
  {
    // Vacation-rentals platform — excluded from sync by the sale-only policy.
    id: 'bluearuba', name: 'BlueAruba Realty', url: 'https://www.bluearuba.com',
  },
  // These sites were down/erroring when probed (530/503) — kept in the
  // directory; adapters can be added if they come back online.
  { id: 'benrealestate', name: 'Ben Real Estate', url: 'https://benrealestatearuba.com' },
  { id: 'century21', name: 'Century 21 Aruba', url: 'https://century21aruba.com' },
  {
    id: 'goldcoast', name: 'Gold Coast Aruba', url: 'https://www.goldcoastaruba.com',
    adapter: generic,
    config: {
      listingPattern: '/(property|properties|listing|listings|homes-for-sale|villas)/[^/]+',
      archives: [
        { path: '', status: 'sale', pages: 1 },
        { path: '/property/', status: 'sale', pages: 1 },
      ],
    },
  },
  { id: 'kellerwilliams', name: 'Keller Williams Aruba', url: 'https://kwaruba.com' },
  { id: 'casyestilo', name: 'Cas y Estilo', url: 'https://arubahomes.com' },
];

export function allSources(env) {
  if (isDemo(env)) {
    return [...BASE, { id: 'demo', name: 'Demo Data (sample)', url: 'https://example.com', adapter: demo, demo: true }];
  }
  return BASE;
}

export const enabledSources = (env) => allSources(env).filter((s) => s.adapter);
export const getSource = (env, id) => allSources(env).find((s) => s.id === id);
