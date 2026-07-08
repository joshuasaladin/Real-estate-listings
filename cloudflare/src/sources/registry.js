// Registry of every real estate company in Aruba. Entries with an `adapter`
// are synced every 4 hours by the Cron Trigger; entries without one still
// appear in the site's agency directory as "not synced yet".
//
// To add a company: add an entry here. To make it sync, write an adapter
// (see adapters/arubalistings.js as a model) and reference it.
import { isDemo } from '../config.js';
import * as arubalistings from '../adapters/arubalistings.js';
import * as demo from '../adapters/demo.js';

const BASE = [
  { id: 'arubalistings', name: 'Aruba Listings', url: 'https://arubalistings.com', adapter: arubalistings },
  { id: 'mpgaruba', name: 'MPG Aruba Real Estate', url: 'https://www.mpgaruba.com' },
  { id: 'coldwellbanker', name: 'Coldwell Banker Aruba Realty', url: 'https://www.coldwellbanker.aw' },
  { id: 'sothebys', name: "Aruba Sotheby's International Realty", url: 'https://www.sothebysrealty.com/eng/sales/abw' },
  { id: 'bhhsaruba', name: 'Berkshire Hathaway HomeServices Aruba Realty', url: 'https://www.bhhsaruba.com' },
  { id: 'arubapalms', name: 'Aruba Palms Realtors', url: 'https://arubapalmsrealtors.com' },
  { id: 'arubabrokers', name: 'Aruba Brokers', url: 'https://www.arubabrokers.com' },
  { id: 'remaxaruba', name: 'RE/MAX Aruba', url: 'https://remaxaruba.com' },
  { id: 'bluefin', name: 'Bluefin Realtors', url: 'https://bluefinrealtors.com' },
  { id: 'associatedrealtors', name: 'Associated Realtors Aruba', url: 'https://associatedrealtorsaruba.com' },
  { id: 'buyersagent', name: "Buyer's Agent Aruba", url: 'https://buyersagentaruba.com' },
  { id: 'bluearuba', name: 'BlueAruba Realty', url: 'https://www.bluearuba.com' },
  { id: 'benrealestate', name: 'Ben Real Estate', url: 'https://benrealestatearuba.com' },
  { id: 'century21', name: 'Century 21 Aruba', url: 'https://century21aruba.com' },
  { id: 'goldcoast', name: 'Gold Coast Aruba', url: 'https://www.goldcoastaruba.com' },
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
