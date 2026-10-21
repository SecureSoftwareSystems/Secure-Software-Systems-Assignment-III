'use strict';
// Run with: npm test (Node's built-in test runner, no extra framework needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createAuth, actorOf, requireSigningKey, requireRole } = require('..');

const KEY = 'test-only-jwt-signing-key-0123456789abcdef';
const auth = createAuth({ jwt, signingKey: KEY });

function run(mw, headers = {}, user) {
  const req = { headers, user };
  const out = { status: 200, body: undefined, nextCalled: false };
  const res = { status(code) { out.status = code; return { json(b) { out.body = b; } }; } };
  mw(req, res, () => { out.nextCalled = true; });
  return { req, out };
}
const sign = (claims, opts = {}) => jwt.sign(claims, KEY, { algorithm: 'HS256', expiresIn: '15m', ...opts });

test('accepts a token issued by auth-access-control (numeric sub) and sets req.user', () => {
  const { req, out } = run(auth.authenticate, { authorization: `Bearer ${sign({ sub: 7, role: 'delegate', username: 'delegate1' })}` });
  assert.equal(out.nextCalled, true);
  assert.deepEqual(req.user, { id: 7, role: 'delegate', username: 'delegate1' });
});

test('accepts a service token with a string sub', () => {
  const { req, out } = run(auth.authenticate, { authorization: `Bearer ${sign({ sub: 'svc:results-api', role: 'auditor' })}` });
  assert.equal(out.nextCalled, true);
  assert.equal(req.user.id, 'svc:results-api');
});

test('401 without a header, or with a non-Bearer scheme', () => {
  assert.equal(run(auth.authenticate, {}).out.status, 401);
  assert.equal(run(auth.authenticate, { authorization: 'Basic YWRtaW46YWRtaW4=' }).out.status, 401);
});

test('401 for an expired token (SR-17)', () => {
  const { out } = run(auth.authenticate, { authorization: `Bearer ${sign({ sub: 1, role: 'admin' }, { expiresIn: -5 })}` });
  assert.equal(out.status, 401);
  assert.equal(out.nextCalled, false);
});

test('401 for a token signed with a different key', () => {
  const forged = jwt.sign({ sub: 1, role: 'admin' }, 'attacker-key-that-is-long-enough-0000000', { algorithm: 'HS256' });
  assert.equal(run(auth.authenticate, { authorization: `Bearer ${forged}` }).out.status, 401);
});

test('401 for an unsigned "alg: none" token', () => {
  const none = jwt.sign({ sub: 1, role: 'admin' }, '', { algorithm: 'none' });
  assert.equal(run(auth.authenticate, { authorization: `Bearer ${none}` }).out.status, 401);
});

test('401 for a validly signed token with an unknown role', () => {
  assert.equal(run(auth.authenticate, { authorization: `Bearer ${sign({ sub: 1, role: 'superuser' })}` }).out.status, 401);
});

test('requireRole: 403 for the wrong role, 401 when not signed in, next() when allowed', () => {
  const onlyAdmin = auth.requireRole('admin');
  assert.equal(run(onlyAdmin, {}, { id: 1, role: 'auditor' }).out.status, 403);
  assert.equal(run(onlyAdmin, {}, undefined).out.status, 401);
  assert.equal(run(onlyAdmin, {}, { id: 1, role: 'admin' }).out.nextCalled, true);
});

test('requireRole refuses a misspelt role at startup', () => {
  assert.throws(() => auth.requireRole('admn'), /unknown role/);
});

test('fails closed: no key, or a short key, stops the service starting (SR-16)', () => {
  assert.throws(() => createAuth({ jwt, signingKey: undefined }), /JWT_SIGNING_KEY/);
  assert.throws(() => createAuth({ jwt, signingKey: 'dev-only-secret' }), /JWT_SIGNING_KEY/);
  assert.throws(() => requireSigningKey('short'), /at least 32/);
});

test('standalone requireRole works without a key (used by availability-resilience)', () => {
  assert.equal(run(requireRole('auditor'), {}, { id: 2, role: 'auditor' }).out.nextCalled, true);
  assert.equal(run(requireRole('auditor'), {}, { id: 2, role: 'delegate' }).out.status, 403);
});

test('actorOf uses the username when present, else user-<id>', () => {
  assert.equal(actorOf({ id: 3, role: 'auditor', username: 'auditor1' }), 'auditor1');
  assert.equal(actorOf({ id: 3, role: 'auditor' }), 'user-3');
});
