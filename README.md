# Aruba Homes — every real estate listing in Aruba, one website

A "Zillow for Aruba": one searchable site that aggregates property listings
from **all real estate companies in Aruba**, re-syncs automatically **every
4 hours**, and always credits and links back to the agency that listed each
property.

## Features

- **Unified search** across every agency: for sale / for rent, price range
  (in **USD and AWG**, ƒ1.79 = US$1), area (Noord, Palm Beach, Malmok,
  Oranjestad, Savaneta, San Nicolas, …), bedrooms, property type
  (house/villa/condo/apartment/land/commercial/timeshare), and by agency.
- **Grid and map view** (Leaflet + OpenStreetMap), sort by newest or price,
  **"New" badge** for listings first seen in the last 7 days, live total count.
- **Source credit everywhere** — each card names the listing agency with a
  "View original ↗" link. Duplicates listed by several agencies are
  **merged into one card** crediting every agency.
- **Auto-sync every 4 hours** (`node-cron`, `0 */4 * * *`): new listings are
  added, prices updated, and vanished listings deactivated. Each source runs
  isolated — one broken site never breaks the rest.
- **Admin status page** (`/admin.html`): per-company last run, last success,
  active listing count, errors, and a "Sync all sources now" button.
- **Polite scraping**: honors robots.txt, rate-limits per host (1.5s),
  descriptive user-agent, prefers structured data (JSON-LD) when available.

## Quick start

```bash
npm install
npm run dev        # DEMO=1: starts with fixture data at http://localhost:3000
npm start          # production: real sources only
npm run sync       # one-off sync from the CLI
```

Node.js **22.5+** required (uses the built-in `node:sqlite` — no native deps).

## Architecture

```
┌────────────┐   every 4h    ┌──────────────┐    normalize    ┌──────────┐
│ node-cron  ├───────────────▶ sync.js       ├────────────────▶ SQLite    │
│ scheduler  │               │ per-source    │  dedupe.js      │ data/    │
└────────────┘               │ adapters      │  (merge dupes)  └────┬─────┘
                             └──────────────┘                       │
   src/adapters/*.js  ← one small module per agency                 ▼
                                                        ┌──────────────────┐
                                                        │ Express API +    │
                                                        │ static frontend  │
                                                        │ /api/listings …  │
                                                        └──────────────────┘
```

- `src/sources/index.js` — **the registry of every Aruban real estate
  company**. Entries without an adapter still appear in the site's agency
  directory as "not synced yet".
- `src/adapters/` — one module per source. `_template.js` shows the
  contract: `fetchListings(source) -> [{external_id, url, title, ...}]`.
- `src/lib/normalize.js` — canonical Listing schema: currency conversion,
  property-type and area inference, field clamping.
- `src/dedupe.js` — groups listings that match on location (~110 m geocell
  or normalized address) + beds/baths + price within 2%.
- `src/db.js` — SQLite schema (`listings`, `sync_runs`) using `node:sqlite`.
- `src/server.js` — API: `/api/listings` (search), `/api/listings/:id`,
  `/api/meta`, `/api/status`, `POST /api/sync`.
- `public/` — vanilla JS frontend (grid, map, filters) + admin page.

## Adding a new real estate company

1. Add an entry to `src/sources/index.js` (name + URL). It immediately shows
   up in the on-site agency directory.
2. Copy `src/adapters/_template.js`, implement `fetchListings`, and wire it
   into the registry entry. Done — it now syncs every 4 hours.

## Source status

| Source | Status |
| --- | --- |
| Aruba Listings (aggregator, many brokers) | Adapter written (JSON-LD + heuristic card parsing). **Note:** the site sits behind anti-bot protection that blocks datacenter IPs — run from a normal server/residential IP, or contact them for feed access. |
| MPG Aruba, Coldwell Banker, Sotheby's, BHHS, Aruba Palms, Aruba Brokers, RE/MAX, Bluefin, Associated Realtors, Buyer's Agent, BlueAruba, Ben Real Estate, Century 21, Gold Coast, Keller Williams, Cas y Estilo | In the directory; adapters pending (copy the template). |
| Demo fixtures | `DEMO=1` only — 12 sample listings (incl. one deliberate duplicate pair) to exercise the full pipeline offline. |

## Responsible aggregation

Adapters respect robots.txt and rate limits, identify themselves with a
descriptive user-agent, and the site never hides a listing's origin — every
card links to the original listing. The long-term path is partnering with
agencies for official feeds; several may be happy to provide one since the
site drives traffic to them.

## Configuration

Environment variables: `PORT` (default 3000), `DB_PATH`
(default `data/listings.db`), `DEMO=1` (enable fixture source).
Sync cadence, currency peg, rate limits: `src/config.js`.
