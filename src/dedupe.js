// De-duplication: the same physical property is often listed by several
// agencies. Listings are grouped when their location matches (coordinates
// within ~150m, or identical normalized address) AND beds/baths match AND
// prices are within 2%. Grouped listings share a dedupe_group id; the API
// merges each group into one card crediting every agency.
import { getDb } from './db.js';

const PRICE_TOLERANCE = 0.02;

export function runDedupe() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, source_id, price_usd, bedrooms, bathrooms, lat, lng, address, status
       FROM listings WHERE active = 1`
    )
    .all();

  // Bucket by coarse location so we only compare nearby listings.
  const buckets = new Map();
  for (const r of rows) {
    let key;
    if (r.lat != null && r.lng != null) {
      key = `geo:${r.lat.toFixed(3)}:${r.lng.toFixed(3)}`; // ~110m cells
    } else if (r.address) {
      key = `addr:${r.address.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    } else {
      continue; // nothing to match on
    }
    key += `:${r.status}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const setGroup = db.prepare('UPDATE listings SET dedupe_group = ? WHERE id = ?');
  const clearAll = db.prepare('UPDATE listings SET dedupe_group = NULL');
  clearAll.run();

  let groupId = 0;
  let grouped = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < bucket.length; i++) {
      if (used.has(i)) continue;
      const members = [i];
      for (let j = i + 1; j < bucket.length; j++) {
        if (used.has(j)) continue;
        if (isSameProperty(bucket[i], bucket[j])) members.push(j);
      }
      if (members.length > 1) {
        groupId++;
        for (const idx of members) {
          used.add(idx);
          setGroup.run(groupId, bucket[idx].id);
          grouped++;
        }
      }
    }
  }
  return { groups: groupId, listings_grouped: grouped };
}

function isSameProperty(a, b) {
  if (a.bedrooms !== b.bedrooms || a.bathrooms !== b.bathrooms) return false;
  if (a.price_usd && b.price_usd) {
    const diff = Math.abs(a.price_usd - b.price_usd) / Math.max(a.price_usd, b.price_usd);
    if (diff > PRICE_TOLERANCE) return false;
  }
  return true;
}
