-- D1 schema for the Aruba Homes aggregator.
-- Apply with:  wrangler d1 execute aruba_homes --file=schema.sql   (add --local for dev)

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
