// Registry of every real estate company in Aruba. Entries with an `adapter`
// are synced every 4 hours by the Cron Trigger; entries without one still
// appear in the site's agency directory as "not synced yet".
//
// The generic adapter is driven by `config` (archive pages + listing-URL
// pattern) — see adapters/generic.js. Patterns below were verified via the
// /api/probe endpoint (what Cloudflare's network can actually reach).
import { isDemo } from '../config.js';
import * as generic from '../adapters/generic.js';
import * as demo from '../adapters/demo.js';

const BASE = [
  {
    // Aggregator covering many brokers. Its robots.txt disallows the /sale/all
    // search pages (respected), so we harvest the listing links surfaced on
    // the homepage instead.
    id: 'arubalistings', name: 'Aruba Listings', url: 'https://arubalistings.com',
    adapter: generic,
    config: {
      listingPattern: '/(sale|rent)/[^/]+',
      archives: [{ path: '', status: 'sale', pages: 1 }],
    },
  },
  {
    // OctoberCMS; /property archive 404s but the homepage carries listing
    // links (/property/<slug>) — harvest those plus likely archive paths.
    id: 'mpgaruba', name: 'MPG Aruba Real Estate', url: 'https://www.mpgaruba.com',
    adapter: generic,
    config: {
      listingPattern: '/property/[^/]+',
      archives: [
        { path: '', status: 'sale', pages: 1 },
        { path: '/properties', status: 'sale', pages: 1 },
        { path: '/for-sale', status: 'sale', pages: 1 },
        { path: '/for-rent', status: 'rent', pages: 1 },
      ],
    },
  },
  { id: 'coldwellbanker', name: 'Coldwell Banker Aruba Realty', url: 'https://www.coldwellbanker.aw' },
  { id: 'sothebys', name: "Aruba Sotheby's International Realty", url: 'https://www.sothebysrealty.com/eng/sales/abw' },
  { id: 'bhhsaruba', name: 'Berkshire Hathaway HomeServices Aruba Realty', url: 'https://www.bhhsaruba.com' },
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
    // Category pages are JS-rendered (fetch OK but 0 parseable cards); the
    // homepage carries server-rendered /property/details/ links, so start
    // there and keep the category pages in case they gain SSR.
    id: 'remaxaruba', name: 'RE/MAX Aruba', url: 'https://remaxaruba.com',
    adapter: generic,
    config: {
      listingPattern: '/property/details/[^/]+',
      archives: [
        { path: '', status: 'sale', pages: 1 },
        { path: '/property/residential-for-sale', status: 'sale', pages: 1 },
        { path: '/property/condominium-for-sale', status: 'sale', pages: 1 },
        { path: '/property/land-for-sale', status: 'sale', pages: 1 },
        { path: '/property/residential-rental', status: 'rent', pages: 1 },
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
  { id: 'buyersagent', name: "Buyer's Agent Aruba", url: 'https://buyersagentaruba.com' },
  { id: 'bluearuba', name: 'BlueAruba Realty', url: 'https://www.bluearuba.com' },
  { id: 'benrealestate', name: 'Ben Real Estate', url: 'https://benrealestatearuba.com' },
  { id: 'century21', name: 'Century 21 Aruba', url: 'https://century21aruba.com' },
  {
    // /properties/ 404s; try the homepage and common WP archive paths.
    id: 'goldcoast', name: 'Gold Coast Aruba', url: 'https://www.goldcoastaruba.com',
    adapter: generic,
    config: {
      listingPattern: '/(property|properties|listing|listings|homes-for-sale|villas)/[^/]+',
      archives: [
        { path: '', status: 'sale', pages: 1 },
        { path: '/homes-for-sale/', status: 'sale', pages: 1 },
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
