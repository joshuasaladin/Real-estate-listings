// D1 (Cloudflare's serverless SQLite) access layer. All calls are async and
// use the `env.DB` binding declared in wrangler.toml. The schema itself lives
// in schema.sql and is applied with `wrangler d1 execute` (see README).

export async function upsertListing(env, l, now) {
  await env.DB.prepare(
    `INSERT INTO listings (
        source_id, external_id, url, title, description,
        price_usd, price_awg, price_raw, status, type, area, address,
        lat, lng, bedrooms, bathrooms, building_m2, lot_m2, images,
        active, first_seen_at, last_seen_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
     ON CONFLICT (source_id, external_id) DO UPDATE SET
        url=excluded.url, title=excluded.title, description=excluded.description,
        price_usd=excluded.price_usd, price_awg=excluded.price_awg, price_raw=excluded.price_raw,
        status=excluded.status, type=excluded.type, area=excluded.area, address=excluded.address,
        lat=excluded.lat, lng=excluded.lng, bedrooms=excluded.bedrooms, bathrooms=excluded.bathrooms,
        building_m2=excluded.building_m2, lot_m2=excluded.lot_m2, images=excluded.images,
        active=1, last_seen_at=excluded.last_seen_at`
  )
    .bind(
      l.source_id, l.external_id, l.url, l.title, l.description,
      l.price_usd, l.price_awg, l.price_raw, l.status, l.type, l.area, l.address,
      l.lat, l.lng, l.bedrooms, l.bathrooms, l.building_m2, l.lot_m2, l.images,
      now, now
    )
    .run();
}

export async function deactivateMissing(env, sourceId, now) {
  await env.DB.prepare(`UPDATE listings SET active = 0 WHERE source_id = ? AND last_seen_at < ?`)
    .bind(sourceId, now)
    .run();
}

// Tiny key-value store for sync state (created on demand — no migration).
export async function ensureMeta(env) {
  await env.DB.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
}

export async function getMeta(env, key) {
  const row = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

export async function setMeta(env, key, value) {
  await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(key, value)
    .run();
}

/** Map of external_id -> last_seen_at for one source (crawl prioritization). */
export async function listingSeen(env, sourceId) {
  const { results } = await env.DB.prepare('SELECT external_id, last_seen_at FROM listings WHERE source_id = ?')
    .bind(sourceId)
    .all();
  return new Map(results.map((r) => [r.external_id, r.last_seen_at]));
}

/** Deactivate a source's listings whose external_id is not in keepIds. */
export async function deactivateNotIn(env, sourceId, keepIds) {
  const { results } = await env.DB.prepare('SELECT external_id FROM listings WHERE source_id = ? AND active = 1')
    .bind(sourceId)
    .all();
  const gone = results.map((r) => r.external_id).filter((id) => !keepIds.has(id));
  for (let i = 0; i < gone.length; i += 50) {
    const chunk = gone.slice(i, i + 50);
    await env.DB.prepare(
      `UPDATE listings SET active = 0 WHERE source_id = ? AND external_id IN (${chunk.map(() => '?').join(',')})`
    )
      .bind(sourceId, ...chunk)
      .run();
  }
  return gone.length;
}

export async function recordSyncRun(env, r) {
  await env.DB.prepare(
    `INSERT INTO sync_runs (source_id, started_at, finished_at, ok, listings_found, error)
     VALUES (?,?,?,?,?,?)`
  )
    .bind(r.source_id, r.started_at, r.finished_at, r.ok ? 1 : 0, r.listings_found ?? null, r.error ?? null)
    .run();
}
