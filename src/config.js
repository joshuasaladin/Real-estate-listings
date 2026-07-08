// Global configuration for the aggregator.
export const CONFIG = {
  // Aruban florin is pegged to the US dollar.
  AWG_PER_USD: 1.79,

  // Sync every 4 hours, on the hour.
  CRON_SCHEDULE: '0 */4 * * *',

  // Polite scraping defaults.
  USER_AGENT:
    'ArubaHomesAggregator/0.1 (+https://github.com/joshuasaladin/real-estate-listings; listing aggregator that credits and links every source)',
  REQUEST_DELAY_MS: 1500, // min delay between requests to the same host
  REQUEST_TIMEOUT_MS: 30000,

  // A listing is "New" if first seen within this many days.
  NEW_BADGE_DAYS: 7,

  PORT: Number(process.env.PORT || 3000),
  DB_PATH: process.env.DB_PATH || 'data/listings.db',

  // Demo mode loads fixture listings so the full pipeline and UI can be
  // exercised without network access. Enable with DEMO=1.
  DEMO: process.env.DEMO === '1',
};
