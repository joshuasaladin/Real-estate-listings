// API router for the Worker. Mirrors the Express API of the Node build so the
// exact same frontend works unchanged:
//   GET  /api/listings        search
//   GET  /api/listings/:id    single listing
//   GET  /api/meta            filter metadata + site stats
//   GET  /api/status          per-source sync status (admin)
//   POST /api/sync            manual sync trigger
import { CONFIG } from './config.js';
import { AREAS, PROPERTY_TYPES } from './normalize.js';
import { allSources, getSource } from './sources/registry.js';
import { syncAll } from './sync.js';
import { handleProbe } from './probe.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/listings') return listings(url, env);
  if (path.startsWith('/api/listings/')) return oneListing(path.split('/').pop(), env);
  if (path === '/api/meta') return meta(env);
  if (path === '/api/status') return status(env);
  if (path === '/api/sync' && request.method === 'POST') return json(await syncAll(env));
  if (path === '/api/probe') return handleProbe(url, env);
  if (path === '/healthz') return json({ ok: true });
  return json({ error: 'not found' }, 404);
}

async function listings(url, env) {
  const q = url.searchParams;
  const where = ['active = 1'];
  const params = [];
  const eq = (col, val) => { where.push(`${col} = ?`); params.push(val); };

  if (q.get('status') === 'sale' || q.get('status') === 'rent') eq('status', q.get('status'));
  if (q.get('type')) eq('type', q.get('type'));
  if (q.get('area')) eq('area', q.get('area'));
  if (q.get('source')) eq('source_id', q.get('source'));
  if (q.get('minPrice')) { where.push('price_usd >= ?'); params.push(Number(q.get('minPrice'))); }
  if (q.get('maxPrice')) { where.push('price_usd <= ?'); params.push(Number(q.get('maxPrice'))); }
  if (q.get('beds')) { where.push('bedrooms >= ?'); params.push(Number(q.get('beds'))); }
  if (q.get('q')) {
    where.push('(title LIKE ? OR description LIKE ? OR address LIKE ? OR area LIKE ?)');
    const like = `%${q.get('q')}%`;
    params.push(like, like, like, like);
  }

  const sort =
    q.get('sort') === 'price_asc' ? 'price_usd IS NULL, price_usd ASC'
    : q.get('sort') === 'price_desc' ? 'price_usd IS NULL, price_usd DESC'
    : 'first_seen_at DESC, id DESC';

  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM listings WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 2000`
  ).bind(...params).all();

  // Merge dedupe groups into single cards crediting every agency.
  const groupMembers = new Map();
  for (const r of rows) {
    if (r.dedupe_group != null) {
      if (!groupMembers.has(r.dedupe_group)) groupMembers.set(r.dedupe_group, []);
      groupMembers.get(r.dedupe_group).push(r);
    }
  }
  const merged = [];
  const seenGroups = new Set();
  for (const r of rows) {
    if (r.dedupe_group != null) {
      if (seenGroups.has(r.dedupe_group)) continue;
      seenGroups.add(r.dedupe_group);
      const members = groupMembers.get(r.dedupe_group);
      merged.push(toCard(env, members[0], members));
    } else {
      merged.push(toCard(env, r, [r]));
    }
  }

  const page = Math.max(1, Number(q.get('page')) || 1);
  const perPage = Math.min(60, Number(q.get('perPage')) || 24);
  return json({ total: merged.length, page, perPage, listings: merged.slice((page - 1) * perPage, page * perPage) });
}

async function oneListing(id, env) {
  const row = await env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(Number(id)).first();
  if (!row) return json({ error: 'not found' }, 404);
  const members = row.dedupe_group != null
    ? (await env.DB.prepare('SELECT * FROM listings WHERE dedupe_group = ?').bind(row.dedupe_group).all()).results
    : [row];
  return json(toCard(env, row, members));
}

async function meta(env) {
  const { results: counts } = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM listings WHERE active = 1 GROUP BY status`
  ).all();
  const lastRun = await env.DB.prepare(`SELECT MAX(finished_at) AS t FROM sync_runs WHERE ok = 1`).first();
  return json({
    areas: AREAS,
    types: PROPERTY_TYPES,
    sources: allSources(env).map((s) => ({ id: s.id, name: s.name, url: s.url, synced: !!s.adapter, demo: !!s.demo })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    lastUpdated: lastRun?.t || null,
    newBadgeDays: CONFIG.NEW_BADGE_DAYS,
  });
}

async function status(env) {
  const out = [];
  for (const s of allSources(env)) {
    const last = await env.DB.prepare(`SELECT * FROM sync_runs WHERE source_id = ? ORDER BY id DESC LIMIT 1`).bind(s.id).first();
    const lastOk = await env.DB.prepare(`SELECT finished_at FROM sync_runs WHERE source_id = ? AND ok = 1 ORDER BY id DESC LIMIT 1`).bind(s.id).first();
    const active = await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings WHERE source_id = ? AND active = 1`).bind(s.id).first();
    out.push({
      id: s.id, name: s.name, url: s.url, synced: !!s.adapter,
      activeListings: active?.n ?? 0,
      lastRun: last ? { at: last.finished_at, ok: !!last.ok, found: last.listings_found, error: last.error } : null,
      lastSuccess: lastOk?.finished_at || null,
    });
  }
  return json({ schedule: CONFIG.CRON_SCHEDULE, sources: out });
}

function toCard(env, primary, members) {
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
      const s = getSource(env, m.source_id);
      return { id: m.source_id, name: s?.name || m.source_id, url: m.url, site: s?.url };
    }),
  };
}
