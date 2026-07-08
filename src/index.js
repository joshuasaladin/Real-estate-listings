import { CONFIG } from './config.js';
import { getDb } from './db.js';
import { createServer } from './server.js';
import { startScheduler } from './scheduler.js';

getDb();
startScheduler();
createServer().listen(CONFIG.PORT, () => {
  console.log(`Aruba Homes Aggregator running at http://localhost:${CONFIG.PORT}${CONFIG.DEMO ? ' (DEMO mode)' : ''}`);
});
