import cron from 'node-cron';
import { CONFIG } from './config.js';
import { syncAll } from './sync.js';

/** Schedule the 4-hour sync and run one sync immediately on boot. */
export function startScheduler() {
  cron.schedule(CONFIG.CRON_SCHEDULE, () => {
    console.log(`[scheduler] cron fired (${CONFIG.CRON_SCHEDULE})`);
    syncAll().catch((err) => console.error('[scheduler] sync failed:', err));
  });
  console.log(`[scheduler] armed: ${CONFIG.CRON_SCHEDULE} (every 4 hours)`);
  syncAll().catch((err) => console.error('[scheduler] initial sync failed:', err));
}
