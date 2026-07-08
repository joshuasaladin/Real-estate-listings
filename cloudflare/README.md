# Aruba Homes — Cloudflare (Workers + D1) build

The same aggregator as the Node app in the repo root, ported to run **entirely
on Cloudflare's free tier** and gated behind a **password login that's just for
you** (Cloudflare Access).

| Node build (repo root) | This Cloudflare build |
| --- | --- |
| Express server | **Worker** `fetch` handler |
| `node:sqlite` file | **D1** (serverless SQLite) |
| `node-cron` every 4h | **Cron Trigger** `0 */4 * * *` |
| Runs on a paid always-on host | **$0/month** on Workers/D1 free tier |
| Public | **Private** behind Cloudflare Access |

The frontend (`public/`) and the whole data pipeline (normalize → dedupe →
credit every source) are unchanged.

---

## Deploy via the Cloudflare dashboard (Workers Builds / Git integration)

If you connected the GitHub repo in the dashboard (Workers & Pages → your
Worker), set these under **Settings → Build** — the defaults point at the repo
root and will fail because this app lives in the `cloudflare/` subfolder:

| Setting | Value |
| --- | --- |
| Build branch | `claude/aruba-listings-aggregator-khn30f` (or `main` after merging) |
| Root directory | `/cloudflare` |
| Build command | `npm install` |
| Deploy command | `npx wrangler deploy` |

Then create the database (one-time):

1. **Storage & Databases → D1 → Create Database**, name it `aruba_homes`.
2. Copy its **Database ID** into `wrangler.toml` (`database_id = "…"`),
   commit and push — the placeholder value will fail the deploy on purpose
   until this is set.
3. On the database page, open the **Console** tab and run the contents of
   [`schema.sql`](schema.sql) to create the tables.
4. **Retry build.** After it deploys, open the site's sync-status page and
   click **“Sync all sources now”** (or wait for the 4-hour cron).

## Deploy via the CLI (alternative)

You need a free Cloudflare account and the Wrangler CLI (`npm install` here
installs it locally).

```bash
cd cloudflare
npm install

# 1. Log in to your Cloudflare account
npx wrangler login

# 2. Create the D1 database, then paste the printed database_id into
#    wrangler.toml (replace REPLACE_WITH_ID_FROM_wrangler_d1_create)
npx wrangler d1 create aruba_homes

# 3. Create the tables in the live database
npm run db:init          # runs schema.sql against remote D1

# 4. Deploy the Worker (this also registers the 4-hour Cron Trigger)
npm run deploy
```

Wrangler prints your live URL, e.g. `https://aruba-homes.<your-subdomain>.workers.dev`.
The 4-hour sync now runs automatically. To seed data immediately without
waiting, open the site's **sync status** page and click **“Sync all sources
now.”**

### See it with sample data first (optional)
In the Cloudflare dashboard → your Worker → **Settings → Variables**, add
`DEMO = 1`, redeploy or re-sync, and the 12 sample listings appear. Remove it
for live-only data.

---

## 🔒 Lock it to just you — Cloudflare Access

This puts a **login wall in front of the whole site** so only your email can
open it. Free for up to 50 users.

1. In the Cloudflare dashboard open **Zero Trust** (one-time: pick the free
   plan, no card required).
2. **Access → Applications → Add an application → Self-hosted.**
3. **Application domain:** your Worker URL
   (`aruba-homes.<your-subdomain>.workers.dev`).
4. Add a policy:
   - Action: **Allow**
   - Include: **Emails** → `joshuasaladin297@gmail.com`
5. Save. Identity method **One-time PIN** is on by default.

Now visiting the site prompts for your email and emails you a 6-digit code —
no password to leak, and nobody else gets in. Add more emails to the policy
any time.

> Prefer a plain shared password instead of Access? Say the word and I'll add
> Basic-Auth middleware to the Worker (a single password in an env var). Access
> is the more secure option and needs no code.

---

## Local development

```bash
cp .dev.vars.example .dev.vars     # DEMO=1 for offline sample data
npm run db:init:local              # create tables in the local D1
npm run dev                        # http://localhost:8787
```

Trigger the 4-hour sync manually while developing:
`curl "http://localhost:8787/__scheduled?cron=0+*/4+*+*+*"` (run `wrangler dev`
with `--test-scheduled`), or POST `/api/sync`.

---

## Layout

```
cloudflare/
  wrangler.toml        Worker config: D1 binding, Cron Trigger, static assets
  schema.sql           D1 table definitions
  public/              frontend (served via the ASSETS binding)
  src/
    index.js           Worker entry: fetch + scheduled (cron) handlers
    router.js          /api/* endpoints (D1-backed)
    sync.js            sync orchestrator
    dedupe.js          cross-agency de-duplication (D1)
    db.js              D1 helpers
    normalize.js       canonical Listing schema + currency/type/area logic
    fetch.js           polite fetch (robots.txt, rate limit, UA)
    sources/registry.js  every Aruban agency (add new ones here)
    adapters/          one module per source (arubalistings, demo, _template)
```

## Adding a real agency
1. Add it to `src/sources/registry.js`.
2. Copy an adapter, implement `fetchListings(source)`, wire it in.
It then syncs every 4 hours automatically.

## Notes & limits
- **Free tier is plenty**: D1 free = 5 GB + 5M reads/day; Workers free =
  100k requests/day; Cron Triggers included.
- **`arubalistings.com` returned HTTP 403** from our test IP (anti-bot). It may
  work from Cloudflare's network; if not, the other agencies need adapters (the
  registry already lists all of them, shown as “not synced yet”).
- The frontend here is a **copy** of the repo-root `public/`. If you change one,
  copy it to the other (or we can consolidate later).
