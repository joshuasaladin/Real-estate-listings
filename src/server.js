import express from 'express';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';
import { SOURCES, getSource } from './sources/index.js';
import { syncAll } from './sync.js';
import { CONFIG } from './config.js';
import { AREAS, PROPERTY_TYPES } from './lib/normalize.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createServer() {
  const app = express();
  app.use(express.static(PUBLIC_DIR));

  // Health check for hosting platforms (Render/Railway/Fly).
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ---- Listings search -----------------------------------------------------
  app.get('/api/listings', (req, res) => {
    const db = getDb();
    const q = req.query;
    const where = ['active = 1'];
    const params = [];

    if (q.status === 'sale' || q.status === 'rent') { where.push('status = ?'); params.push(q.status); }
    if (q.type) { where.push('type = ?'); params.push(String(q.type)); }
    if (q.area) { where.push('area = ?'); params.push(String(q.area)); }
    if (q.source) { where.push('source_id = ?'); params.push(String(q.source)); }
    if (q.minPrice) { where.push('price_usd >= ?'); params.push(Number(q.minPrice)); }
    if (q.maxPrice) { where.push('price_usd <= ?'); params.push(Number(q.maxPrice)); }
    if (q.beds) { where.push('bedrooms >= ?'); params.push(Number(q.beds)); }
    if (q.q) {
      where.push('(title LIKE ? OR description LIKE ? OR address LIKE ? OR area LIKE ?)');
      const like = `%${String(q.q)}%`;
      params.push(like, like, like, like);
    }

    const sort =
      q.sort === 'price_asc' ? 'price_usd ASC NULLS LAST'
      : q.sort === 'price_desc' ? 'price_usd DESC NULLS LAST'
      : 'first_seen_at DESC, id DESC';

    const rows = db
      .prepare(`SELECT * FROM listings WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 2000`)
      .all(...params);

    // Merge dedupe groups into single cards crediting every agency.
    const merged = [];
    const seenGroups = new Set();
    const groupMembers = new Map();
    for (const r of rows) {
      if (r.dedupe_group != null) {
        if (!groupMembers.has(r.dedupe_group)) groupMembers.set(r.dedupe_group, []);
        groupMembers.get(r.dedupe_group).push(r);
      }
    }
    for (const r of rows) {
      if (r.dedupe_group != null) {
        if (seenGroups.has(r.dedupe_group)) continue;
        seenGroups.add(r.dedupe_group);
        const members = groupMembers.get(r.dedupe_group);
        merged.push(toCard(members[0], members));
      } else {
        merged.push(toCard(r, [r]));
      }
    }

    const page = Math.max(1, Number(q.page) || 1);
    const perPage = Math.min(60, Number(q.perPage) || 24);
    res.json({
      total: merged.length,
      page,
      perPage,
      listings: merged.slice((page - 1) * perPage, page * perPage),
    });
  });

  // ---- Single listing ------------------------------------------------------
  app.get('/api/listings/:id', (req, res) => {
    const row = getDb().prepare('SELECT * FROM listings WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'not found' });
    const members =
      row.dedupe_group != null
        ? getDb().prepare('SELECT * FROM listings WHERE dedupe_group = ?').all(row.dedupe_group)
        : [row];
    res.json(toCard(row, members));
  });

  // ---- Filter metadata + site stats ---------------------------------------
  app.get('/api/meta', (req, res) => {
    const db = getDb();
    const counts = db
      .prepare(`SELECT status, COUNT(*) AS n FROM listings WHERE active = 1 GROUP BY status`)
      .all();
    const lastRun = db
      .prepare(`SELECT MAX(finished_at) AS t FROM sync_runs WHERE ok = 1`)
      .get();
    res.json({
      areas: AREAS,
      types: PROPERTY_TYPES,
      sources: SOURCES.map((s) => ({ id: s.id, name: s.name, url: s.url, synced: !!s.adapter, demo: !!s.demo })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      lastUpdated: lastRun?.t || null,
      newBadgeDays: CONFIG.NEW_BADGE_DAYS,
    });
  });

  // ---- Admin: per-source sync status ---------------------------------------
  app.get('/api/status', (req, res) => {
    const db = getDb();
    const status = SOURCES.map((s) => {
      const last = db
        .prepare(`SELECT * FROM sync_runs WHERE source_id = ? ORDER BY id DESC LIMIT 1`)
        .get(s.id);
      const lastOk = db
        .prepare(`SELECT finished_at FROM sync_runs WHERE source_id = ? AND ok = 1 ORDER BY id DESC LIMIT 1`)
        .get(s.id);
      const active = db
        .prepare(`SELECT COUNT(*) AS n FROM listings WHERE source_id = ? AND active = 1`)
        .get(s.id);
      return {
        id: s.id,
        name: s.name,
        url: s.url,
        synced: !!s.adapter,
        activeListings: active?.n ?? 0,
        lastRun: last ? { at: last.finished_at, ok: !!last.ok, found: last.listings_found, error: last.error } : null,
        lastSuccess: lastOk?.finished_at || null,
      };
    });
    res.json({ schedule: CONFIG.CRON_SCHEDULE, sources: status });
  });

  // ---- Admin: manual sync trigger -------------------------------------------
  let syncing = false;
  app.post('/api/sync', async (req, res) => {
    if (syncing) return res.status(409).json({ error: 'sync already running' });
    syncing = true;
    try {
      res.json(await syncAll());
    } finally {
      syncing = false;
    }
  });

  return app;
}

function toCard(primary, members) {
  return {
    id: primary.id,
    title: primary.title,
    description: primary.description,
    price_usd: primary.price_usd,
    price_awg: primary.price_awg,
    price_raw: primary.price_raw,
    status: primary.status,
    type: primary.type,
    area: primary.area,
    address: primary.address,
    lat: primary.lat,
    lng: primary.lng,
    bedrooms: primary.bedrooms,
    bathrooms: primary.bathrooms,
    building_m2: primary.building_m2,
    lot_m2: primary.lot_m2,
    images: JSON.parse(primary.images || '[]'),
    first_seen_at: primary.first_seen_at,
    agencies: members.map((m) => {
      const s = getSource(m.source_id);
      return { id: m.source_id, name: s?.name || m.source_id, url: m.url, site: s?.url };
    }),
  };
}
