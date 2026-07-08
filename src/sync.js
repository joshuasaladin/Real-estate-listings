// Sync orchestrator: runs every enabled source adapter in isolation,
// normalizes and upserts results, deactivates listings that disappeared,
// records per-source run stats, then re-runs de-duplication.
import { enabledSources } from './sources/index.js';
import { normalizeListing } from './lib/normalize.js';
import { getDb, upsertListing, deactivateMissing, recordSyncRun } from './db.js';
import { runDedupe } from './dedupe.js';

export async function syncAll() {
  const results = [];
  for (const source of enabledSources()) {
    results.push(await syncSource(source));
  }
  const dedupe = runDedupe();
  console.log(`[sync] dedupe: ${dedupe.groups} groups covering ${dedupe.listings_grouped} listings`);
  return { sources: results, dedupe };
}

export async function syncSource(source) {
  const started_at = new Date().toISOString();
  console.log(`[sync] ${source.id}: starting`);
  try {
    const raw = await source.adapter.fetchListings(source);
    const now = new Date().toISOString();
    let saved = 0;
    for (const r of raw) {
      const listing = normalizeListing(r, source);
      if (!listing) continue;
      upsertListing(listing, now);
      saved++;
    }
    if (saved > 0) {
      // Only prune when the run produced data — an empty result more likely
      // means the source changed markup than that every listing sold.
      deactivateMissing(source.id, now);
    }
    recordSyncRun({ source_id: source.id, started_at, finished_at: new Date().toISOString(), ok: true, listings_found: saved });
    console.log(`[sync] ${source.id}: OK, ${saved} listings`);
    return { source: source.id, ok: true, listings: saved };
  } catch (err) {
    recordSyncRun({ source_id: source.id, started_at, finished_at: new Date().toISOString(), ok: false, error: String(err.message || err) });
    console.error(`[sync] ${source.id}: FAILED — ${err.message}`);
    return { source: source.id, ok: false, error: String(err.message || err) };
  }
}

// Allow `npm run sync` to run a one-off sync from the CLI.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  getDb();
  syncAll().then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
