#!/usr/bin/env node
/**
 * Creates or updates each service's .env for running the whole system on THIS computer.
 *
 * - JWT_SIGNING_KEY: one new random 256-bit value, written to every service that checks tokens,
 *   so a token from auth-access-control's /auth/login works on all of them (shared-auth contract).
 * - Other secrets (AUDIT_LOG_HMAC_KEY, DATA_ENCRYPTION_KEY) and RESULTS_RELEASE_AT are only
 *   filled in if missing, so existing values are kept.
 *
 * Never share or commit the generated values: .env is git-ignored (SR-16). Each person runs this
 * on their own machine; keys only need to match between services on the same machine.
 *
 * Usage, from the repo root:   node scripts/setup-local-env.js
 * Add --keep-jwt to keep an existing JWT_SIGNING_KEY instead of generating a new one.
 */
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

// Use one JWT key across all services: reuse the first existing one if --keep-jwt, else a new one.
const services = {
  'auth-access-control': {},
  'vote-integrity': { AUDIT_LOG_HMAC_KEY: hex },
  'results-api': {
    DATA_ENCRYPTION_KEY: hex,
    // Default: results go public 1 hour from now. Change it before the demo if you like.
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
