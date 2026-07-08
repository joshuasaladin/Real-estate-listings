// Demo adapter: loads fixture listings from fixtures/demo-listings.json.
// Lets the whole pipeline (sync -> normalize -> dedupe -> DB -> UI) run
// end-to-end without network access. Enabled only with DEMO=1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../../fixtures/demo-listings.json', import.meta.url));

export async function fetchListings() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}
