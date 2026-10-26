import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Start HTTP even when MySQL is temporarily down. The pool reconnects on later requests.
const database = createDatabase(config.database);
const server = createApp(database).listen(config.port, '0.0.0.0', () => {
  console.log(`TaskFlow API listening on http://0.0.0.0:${config.port}`);
});

server.on('error', async (error) => {
  console.error(`HTTP server failed: ${error.code}`);
  await database.close();
  process.exit(1);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(async () => {
    try {
      await database.close();
      clearTimeout(timer);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
