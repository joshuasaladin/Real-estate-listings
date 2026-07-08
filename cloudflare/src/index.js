// Cloudflare Worker entry point.
//  - fetch:     serves the API (/api/*, /healthz) and falls through to the
//               static frontend (public/) via the ASSETS binding.
//  - scheduled: the 4-hour Cron Trigger (0 */4 * * *, set in wrangler.toml)
//               runs the full sync across all sources.
import { handleApi } from './router.js';
import { syncAll } from './sync.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      return handleApi(request, env, ctx);
    }
    // Everything else is the static site (index.html, admin.html, css, js).
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    console.log(`[scheduled] cron ${event.cron} fired`);
    ctx.waitUntil(syncAll(env));
  },
};
