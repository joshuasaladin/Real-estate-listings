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

export async function recordSyncRun(env, r) {
  await env.DB.prepare(
    `INSERT INTO sync_runs (source_id, started_at, finished_at, ok, listings_found, error)
     VALUES (?,?,?,?,?,?)`
  )
    .bind(r.source_id, r.started_at, r.finished_at, r.ok ? 1 : 0, r.listings_found ?? null, r.error ?? null)
    .run();
}
