// Runtime-agnostic constants for the Cloudflare Worker build.
// Per-request settings (like DEMO) come from the Worker `env` binding instead.
export const CONFIG = {
  AWG_PER_USD: 1.79, // Aruban florin is pegged to the US dollar.
  CRON_SCHEDULE: '0 */4 * * *', // shown in the UI; the real trigger lives in wrangler.toml
  USER_AGENT:
    'ArubaHomesAggregator/0.1 (+https://github.com/joshuasaladin/real-estate-listings; listing aggregator that credits and links every source)',
  // Many agency sites reject non-browser user-agents outright (403). We send a
  // realistic UA so listing pages load, while still honoring robots.txt and
  // rate limits, and always linking back to the source.
  BROWSER_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  REQUEST_DELAY_MS: 350, // polite per-host delay (kept low for the Worker CPU budget)
  REQUEST_TIMEOUT_MS: 20000,
  // Cloudflare free tier allows 50 subrequests per invocation; cap below it so
  // a big sync degrades gracefully instead of erroring. Raise on Workers Paid.
  MAX_SUBREQUESTS: 45,
  NEW_BADGE_DAYS: 7,
};

export const isDemo = (env) => env && env.DEMO === '1';
