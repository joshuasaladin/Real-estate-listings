// Runtime-agnostic constants for the Cloudflare Worker build.
// Per-request settings (like DEMO) come from the Worker `env` binding instead.
export const CONFIG = {
  AWG_PER_USD: 1.79, // Aruban florin is pegged to the US dollar.
  CRON_SCHEDULE: '0 */4 * * *', // shown in the UI; the real trigger lives in wrangler.toml
  USER_AGENT:
    'ArubaHomesAggregator/0.1 (+https://github.com/joshuasaladin/real-estate-listings; listing aggregator that credits and links every source)',
  REQUEST_DELAY_MS: 400, // polite per-host delay (kept low for the Worker CPU budget)
  REQUEST_TIMEOUT_MS: 20000,
  NEW_BADGE_DAYS: 7,
};

export const isDemo = (env) => env && env.DEMO === '1';
