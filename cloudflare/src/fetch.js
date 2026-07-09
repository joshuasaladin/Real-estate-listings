import { CONFIG } from './config.js';

// The Workers runtime provides a global fetch, so scraping works the same as
// in Node. robots.txt is honored and requests to the same host are lightly
// spaced. State is per-invocation (Workers are stateless between requests),
// which is fine for a single scheduled sync pass.
const robotsCache = new Map();
const lastHit = new Map();
let subrequestCount = 0; // per-invocation guard against the Workers subrequest cap

export function resetSubrequestBudget() {
  subrequestCount = 0;
}

async function getRobots(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = null;
  try {
    const res = await fetch(new URL('/robots.txt', origin), {
      headers: { 'user-agent': CONFIG.USER_AGENT },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });
    if (res.ok) rules = parseRobots(await res.text());
  } catch {
    /* unreachable robots.txt -> assume allowed but stay polite */
  }
  robotsCache.set(origin, rules);
  return rules;
}

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

export async function politeFetch(url) {
  if (subrequestCount >= CONFIG.MAX_SUBREQUESTS) {
    throw new Error(`subrequest budget (${CONFIG.MAX_SUBREQUESTS}) reached — raise MAX_SUBREQUESTS on Workers Paid`);
  }
  if (!(await isAllowed(url))) throw new Error(`robots.txt disallows fetching ${url}`);
  const host = new URL(url).host;
  const delay = (lastHit.get(host) || 0) + CONFIG.REQUEST_DELAY_MS - Date.now();
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  lastHit.set(host, Date.now());
  subrequestCount++;

  const res = await fetch(url, {
    headers: {
      'user-agent': CONFIG.BROWSER_UA,
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
