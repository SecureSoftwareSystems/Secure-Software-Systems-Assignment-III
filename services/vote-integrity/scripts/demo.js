/* eslint-disable no-console */
/**
 * Synthetic ballot feed + walkthrough for the recorded demo.
 * Stands in for the voting client: opens a contest, submits ballots with
 * one-time tokens, tries a replay, closes intake, runs the verified count
 * and checks the audit chain.
 *
 * Run with the service already started (npm run dev) in another terminal:
 *   npm run demo
 * Reads JWT_SIGNING_KEY from the environment (.env); it is never printed.
 */
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');

const BASE = process.env.VOTE_INTEGRITY_URL || 'http://127.0.0.1:4002';
const KEY = process.env.JWT_SIGNING_KEY;
if (!KEY) {
  console.error('JWT_SIGNING_KEY is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Dev-only stand-in for tokens issued by services/auth-access-control.
const token = (role) => jwt.sign({ sub: `${role}-demo`, role }, KEY, { algorithm: 'HS256', expiresIn: '15m' });
const as = { admin: token('admin'), delegate: token('delegate'), auditor: token('auditor') };

async function call(method, path, role, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(role ? { authorization: `Bearer ${as[role]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function step(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  step('Open contest (admin)');
  console.log(await call('POST', '/contest', 'admin', { candidates: ['Memphis', 'Nashville', 'Chattanooga', 'Knoxville'] }));

  step('Submit 100 ballots with one-time tokens (SR-07)');
  const blocs = [
    [['Memphis', 'Nashville', 'Chattanooga', 'Knoxville'], 42],
    [['Nashville', 'Chattanooga', 'Knoxville', 'Memphis'], 26],
    [['Chattanooga', 'Knoxville', 'Nashville', 'Memphis'], 15],
    [['Knoxville', 'Chattanooga', 'Nashville', 'Memphis'], 17],
  ];
  let firstToken;
  for (const [preferences, n] of blocs) {
    for (let i = 0; i < n; i++) {
      const t = randomBytes(16).toString('base64url');
      firstToken = firstToken || { t, preferences };
      const r = await call('POST', '/ballots', 'admin', { token: t, preferences });
      if (r.status !== 201) throw new Error(`ballot rejected: ${JSON.stringify(r)}`);
    }
  }
  console.log('100 ballots accepted');

  step('Replay the first ballot token: expect 409 (SR-07)');
  console.log(await call('POST', '/ballots', 'admin', { token: firstToken.t, preferences: firstToken.preferences }));

  step('Malformed ballot: expect 400');
  console.log(await call('POST', '/ballots', 'admin', { token: randomBytes(16).toString('base64url'), preferences: ['Mallory'] }));

  step('Auditor tries to start a count: expect 403');
  console.log((await call('POST', '/count', 'auditor')).status);

  step('Close intake and count (SR-03 shuffle -> SR-10 two engines + comparator)');
  await call('POST', '/contest/close', 'admin');
  const count = await call('POST', '/count', 'delegate');
  console.log('status:', count.json.status, '| winner:', count.json.result && count.json.result.winner);
  for (const r of (count.json.result && count.json.result.rounds) || []) {
    console.log(`  round ${r.round}:`, JSON.stringify(r.tallies), r.excluded ? `-> exclude ${r.excluded}` : '-> winner decided');
  }
  console.log('resultHash:', count.json.resultHash);

  step('Verify the audit chain (SR-09)');
  console.log((await call('GET', '/audit/verify', 'auditor')).json);

  step('Signed checkpoint for the isolated store (SR-09 -> SR-12)');
  console.log((await call('POST', '/audit/checkpoint', 'admin')).json);
}

main().catch((err) => {
  console.error('demo failed:', err.message);
  process.exit(1);
});
