#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const keepJwt = process.argv.includes('--keep-jwt');
const hex = () => randomBytes(32).toString('hex');

function readEnv(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

function writeEnv(file, values) {
  const body = [...values].map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(file, body, { mode: 0o600 });
}

const services = {
  'auth-access-control': {},
  'availability-resilience': {},
  'vote-integrity': { AUDIT_LOG_HMAC_KEY: hex },
  'results-api': {
    DATA_ENCRYPTION_KEY: hex,
    RESULTS_RELEASE_AT: () => new Date(Date.now() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  },
};

let jwtKey;
if (keepJwt) {
  for (const name of Object.keys(services)) {
    const existing = readEnv(path.join(root, 'services', name, '.env')).get('JWT_SIGNING_KEY');
    if (existing && existing.length >= 32) { jwtKey = existing; break; }
  }
}
jwtKey = jwtKey || hex();

for (const [name, extras] of Object.entries(services)) {
  const dir = path.join(root, 'services', name);
  if (!fs.existsSync(dir)) { console.log(`skip  ${name} (folder not found)`); continue; }
  const file = path.join(dir, '.env');
  const env = readEnv(file);
  env.set('JWT_SIGNING_KEY', jwtKey);
  const added = [];
  for (const [k, make] of Object.entries(extras)) {
    if (!env.get(k)) { env.set(k, make()); added.push(k); }
  }
  writeEnv(file, env);
  console.log(`ok    services/${name}/.env  (JWT_SIGNING_KEY set${added.length ? '; added ' + added.join(', ') : ''})`);
}
console.log('\nAll services on this computer now share one JWT_SIGNING_KEY. Do not post it anywhere.');
console.log('Start auth-access-control with:  node --env-file=.env dist/server.js   (after npm run build)');
