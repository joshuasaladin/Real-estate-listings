import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG } from './config.js';

let db;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(CONFIG.DB_PATH), { recursive: true });
  db = new DatabaseSync(CONFIG.DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      price_usd REAL,
      price_awg REAL,
      price_raw TEXT,
      status TEXT NOT NULL DEFAULT 'sale',   -- sale | rent
      type TEXT,                             -- house/villa/condo/apartment/land/commercial/timeshare
      area TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      bedrooms INTEGER,
      bathrooms REAL,
      building_m2 REAL,
      lot_m2 REAL,
      images TEXT NOT NULL DEFAULT '[]',     -- JSON array of image URLs
      active INTEGER NOT NULL DEFAULT 1,
      dedupe_group INTEGER,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE (source_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_listings_active ON listings (active, status);
    CREATE INDEX IF NOT EXISTS idx_listings_dedupe ON listings (dedupe_group);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      ok INTEGER,
      listings_found INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_runs_source ON sync_runs (source_id, id DESC);
  `);
  return db;
}

/** Upsert one normalized listing. Returns the listing row id. */
export function upsertListing(l, now) {
  const d = getDb();
  d.prepare(
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
  ).run(
    l.source_id, l.external_id, l.url, l.title, l.description,
    l.price_usd, l.price_awg, l.price_raw, l.status, l.type, l.area, l.address,
    l.lat, l.lng, l.bedrooms, l.bathrooms, l.building_m2, l.lot_m2, l.images,
    now, now
  );
}

/** Deactivate listings from a source that were not seen in the current run. */
export function deactivateMissing(sourceId, now) {
  return getDb()
    .prepare(`UPDATE listings SET active = 0 WHERE source_id = ? AND last_seen_at < ?`)
    .run(sourceId, now);
}

export function recordSyncRun({ source_id, started_at, finished_at, ok, listings_found, error }) {
  getDb()
    .prepare(
      `INSERT INTO sync_runs (source_id, started_at, finished_at, ok, listings_found, error)
       VALUES (?,?,?,?,?,?)`
    )
    .run(source_id, started_at, finished_at, ok ? 1 : 0, listings_found ?? null, error ?? null);
}
