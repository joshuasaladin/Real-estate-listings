import { CONFIG } from '../config.js';

// Per-host politeness: robots.txt disallow rules + minimum delay between hits.
const robotsCache = new Map(); // host -> {disallow: string[]} | null
const lastHit = new Map(); // host -> timestamp

async function getRobots(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = null;
  try {
    const res = await fetch(new URL('/robots.txt', origin), {
      headers: { 'user-agent': CONFIG.USER_AGENT },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });
    if (res.ok) {
      const text = await res.text();
      rules = parseRobots(text);
    }
  } catch {
    // Unreachable robots.txt -> assume allowed but stay polite.
  }
  robotsCache.set(origin, rules);
  return rules;
}

/** Minimal robots.txt parser: collects Disallow rules for * and our UA. */
function parseRobots(text) {
  const disallow = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      applies = value === '*' || CONFIG.USER_AGENT.toLowerCase().includes(value.toLowerCase());
    } else if (key === 'disallow' && applies && value) {
      disallow.push(value);
    }
  }
  return { disallow };
}

export async function isAllowed(url) {
  const u = new URL(url);
  const rules = await getRobots(u.origin);
  if (!rules) return true;
  return !rules.disallow.some((rule) => u.pathname.startsWith(rule));
}

/**
 * Polite fetch: honors robots.txt, rate-limits per host, sends a
 * descriptive user-agent, and throws on non-2xx responses.
 */
export async function politeFetch(url) {
  if (!(await isAllowed(url))) {
    throw new Error(`robots.txt disallows fetching ${url}`);
  }
  const host = new URL(url).host;
  const waitUntil = (lastHit.get(host) || 0) + CONFIG.REQUEST_DELAY_MS;
  const delay = waitUntil - Date.now();
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  lastHit.set(host, Date.now());

  const res = await fetch(url, {
    headers: {
      'user-agent': CONFIG.USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'en,nl;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function fetchHtml(url) {
  return (await politeFetch(url)).text();
}
