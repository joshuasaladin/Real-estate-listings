// Cross-agency de-duplication (D1/async version). Groups listings that match
// on location (~110m geocell or identical normalized address) AND beds/baths
// AND price within 2%. Grouped rows share a dedupe_group id; the API merges
// each group into one card crediting every agency.
const PRICE_TOLERANCE = 0.02;

export async function runDedupe(env) {
  const { results: rows } = await env.DB.prepare(
    `SELECT id, source_id, price_usd, bedrooms, bathrooms, lat, lng, address, status
     FROM listings WHERE active = 1`
  ).all();

  const buckets = new Map();
  for (const r of rows) {
    let key;
    if (r.lat != null && r.lng != null) key = `geo:${r.lat.toFixed(3)}:${r.lng.toFixed(3)}`;
    else if (r.address) key = `addr:${r.address.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    else continue;
    key += `:${r.status}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const statements = [env.DB.prepare('UPDATE listings SET dedupe_group = NULL')];
  const setGroup = env.DB.prepare('UPDATE listings SET dedupe_group = ? WHERE id = ?');

  let groupId = 0;
  let grouped = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < bucket.length; i++) {
      if (used.has(i)) continue;
      const members = [i];
      for (let j = i + 1; j < bucket.length; j++) {
        if (!used.has(j) && isSameProperty(bucket[i], bucket[j])) members.push(j);
      }
      if (members.length > 1) {
        groupId++;
        for (const idx of members) {
          used.add(idx);
          statements.push(setGroup.bind(groupId, bucket[idx].id));
          grouped++;
        }
      }
    }
  }
  await env.DB.batch(statements);
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
