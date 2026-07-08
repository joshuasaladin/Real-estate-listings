// Sync orchestrator (Worker version). Runs each enabled source adapter in
// isolation, normalizes + upserts into D1, deactivates vanished listings,
// records per-source run stats, then re-runs de-duplication.
import { enabledSources } from './sources/registry.js';
import { normalizeListing } from './normalize.js';
import { upsertListing, deactivateMissing, recordSyncRun } from './db.js';
import { runDedupe } from './dedupe.js';

export async function syncAll(env) {
  const results = [];
  for (const source of enabledSources(env)) {
    results.push(await syncSource(env, source));
  }
  const dedupe = await runDedupe(env);
  console.log(`[sync] dedupe: ${dedupe.groups} groups covering ${dedupe.listings_grouped} listings`);
  return { sources: results, dedupe };
}

export async function syncSource(env, source) {
  const started_at = new Date().toISOString();
  console.log(`[sync] ${source.id}: starting`);
  try {
    const raw = await source.adapter.fetchListings(source);
    const now = new Date().toISOString();
    let saved = 0;
    for (const r of raw) {
      const listing = normalizeListing(r, source);
      if (!listing) continue;
      await upsertListing(env, listing, now);
      saved++;
    }
    if (saved > 0) await deactivateMissing(env, source.id, now);
    await recordSyncRun(env, { source_id: source.id, started_at, finished_at: new Date().toISOString(), ok: true, listings_found: saved });
    console.log(`[sync] ${source.id}: OK, ${saved} listings`);
    return { source: source.id, ok: true, listings: saved };
  } catch (err) {
    await recordSyncRun(env, { source_id: source.id, started_at, finished_at: new Date().toISOString(), ok: false, error: String(err.message || err) });
    console.error(`[sync] ${source.id}: FAILED — ${err.message}`);
    return { source: source.id, ok: false, error: String(err.message || err) };
  }
}
