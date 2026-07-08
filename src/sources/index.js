// ============================================================================
// SOURCE REGISTRY — every real estate company in Aruba.
//
// To add a new company: add an entry here. If it has an `adapter`, its
// listings are synced every 4 hours; without one it still appears in the
// site's agency directory ("listings not synced") until you write an adapter.
//
// Writing an adapter: copy src/adapters/_template.js, implement fetchListings,
// and reference it below. Each adapter runs isolated — one broken source
// never breaks the others.
// ============================================================================
import { CONFIG } from '../config.js';
import * as arubalistings from '../adapters/arubalistings.js';
import * as demo from '../adapters/demo.js';

export const SOURCES = [
  {
    id: 'arubalistings',
    name: 'Aruba Listings',
    url: 'https://arubalistings.com',
    adapter: arubalistings, // primary aggregator feed — covers many brokers
  },
  { id: 'mpgaruba', name: 'MPG Aruba Real Estate', url: 'https://www.mpgaruba.com' },
  { id: 'coldwellbanker', name: 'Coldwell Banker Aruba Realty', url: 'https://www.coldwellbanker.aw' },
  {
    id: 'sothebys',
    name: "Aruba Sotheby's International Realty",
    url: 'https://www.sothebysrealty.com/eng/sales/abw',
  },
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

  // Demo source (fixture data) so the full pipeline and UI can be exercised
  // without network access. Enabled only with DEMO=1.
  ...(CONFIG.DEMO
    ? [{ id: 'demo', name: 'Demo Data (sample)', url: 'https://example.com', adapter: demo, demo: true }]
    : []),
];

export const enabledSources = () => SOURCES.filter((s) => s.adapter);
export const getSource = (id) => SOURCES.find((s) => s.id === id);
