import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { createApp } from './app';

const config = loadConfig(); // throws, and the service won't start, if secrets are missing
if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });

const db = openDatabase(config.dbPath);
const app = createApp({ db, jwtSigningKey: config.jwtSigningKey, auditHmacKey: config.auditHmacKey });

// Plain HTTP on localhost only; TLS terminates at the reverse proxy in front (SR-13).
app.listen(config.port, '127.0.0.1', () => {
  console.log(`[vote-integrity] listening on 127.0.0.1:${config.port}`);
});
