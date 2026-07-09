// Sync orchestrator (Worker version). Archive sources run every cycle
// (cheap: a few index pages each). Deep-crawl sources (incremental: true)
// rotate — one per cycle — because each crawls many detail pages; their
// coverage accumulates run over run, and each manual "Sync now" click
// advances the rotation too. Every source runs isolated: one failure never
// breaks the rest.
import { enabledSources } from './sources/registry.js';
import { normalizeListing } from './normalize.js';
import { upsertListing, deactivateMissing, deactivateNotIn, recordSyncRun, ensureMeta, getMeta, setMeta } from './db.js';
import { runDedupe } from './dedupe.js';
import { resetSubrequestBudget } from './fetch.js';

export async function syncAll(env) {
  resetSubrequestBudget(env);
  await ensureMeta(env);
  const run = (parseInt(await getMeta(env, 'run_counter'), 10) || 0) + 1;
  await setMeta(env, 'run_counter', String(run));

  const enabled = enabledSources(env);
  const everyRun = enabled.filter((s) => !s.incremental);
  const incremental = enabled.filter((s) => s.incremental);
  const rotated = incremental.length ? [incremental[(run - 1) % incremental.length]] : [];

  const results = [];
  for (const source of everyRun) results.push(await syncSource(env, source));
  for (const source of rotated) results.push(await syncSource(env, source));

  const dedupe = await runDedupe(env);
  console.log(`[sync] run ${run}: dedupe ${dedupe.groups} groups / ${dedupe.listings_grouped} listings`);
  return {
    run,
    deepCrawledThisRun: rotated.map((s) => s.id),
    sources: results,
    dedupe,
  };
}

export async function syncSource(env, source) {
  const started_at = new Date().toISOString();
  console.log(`[sync] ${source.id}: starting`);
  try {
    const res = await source.adapter.fetchListings(source, env);
    const raw = Array.isArray(res) ? res : res.listings;
    const knownIds = Array.isArray(res) ? null : res.knownIds;

    const now = new Date().toISOString();
    let saved = 0;
    const savedIds = new Set();
    for (const r of raw) {
      const listing = normalizeListing(r, source);
      if (!listing) continue;
      await upsertListing(env, listing, now);
      savedIds.add(listing.external_id);
      saved++;
    }

    if (knownIds) {
      // Deep-crawl source: prune only what vanished from the sitemap, so
      // listings not crawled this run stay active.
      for (const id of savedIds) knownIds.add(id);
      await deactivateNotIn(env, source.id, knownIds);
    } else if (saved > 0) {
      // Archive source with results: anything not re-seen just now is gone.
      await deactivateMissing(env, source.id, now);
    }

    await recordSyncRun(env, { source_id: source.id, started_at, finished_at: new Date().toISOString(), ok: true, listings_found: saved });
    console.log(`[sync] ${source.id}: OK, ${saved} listings`);
    return { source: source.id, ok: true, listings: saved };
  } catch (err) {
    await recordSyncRun(env, { source_id: source.id, started_at, finished_at: new Date().toISOString(), ok: false, error: String(err.message || err) });
    console.error(`[sync] ${source.id}: FAILED — ${err.message}`);
    return { source: source.id, ok: false, error: String(err.message || err) };
  }
}
