import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { openDatabase } from '../src/db';
import { BallotStore } from '../src/ballots';
import { ReplayError, ReplayGuard, hashToken } from '../src/tokens/replayGuard';
import { bearer, makeApp } from './helpers';

const newToken = () => randomBytes(16).toString('base64url'); // 128-bit, 22 chars

describe('SR-07 replay guard (unit)', () => {
  function setup() {
    const db = openDatabase();
    const ballots = new BallotStore(db);
    return { db, ballots, guard: new ReplayGuard(db, ballots) };
  }

  test('a new token is accepted and its ballot stored', () => {
    const { ballots, guard } = setup();
    const t = newToken();
    guard.accept(t, ['A', 'B']);
    expect(ballots.count()).toBe(1);
    expect(guard.isConsumed(t)).toBe(true);
  });

  test('a duplicate token is rejected and no second ballot is stored', () => {
    const { ballots, guard } = setup();
    const t = newToken();
    guard.accept(t, ['A']);
    expect(() => guard.accept(t, ['B'])).toThrow(ReplayError);
    expect(ballots.count()).toBe(1);
  });

  test('only the SHA-256 hash of the token is stored, never the token itself', () => {
    const { db, guard } = setup();
    const t = newToken();
    guard.accept(t, ['A']);
    const rows = db.prepare('SELECT token_hash FROM consumed_tokens').all() as { token_hash: string }[];
    expect(rows).toEqual([{ token_hash: hashToken(t) }]);
    expect(JSON.stringify(rows)).not.toContain(t);
  });

  test('if storing the ballot fails, the token is not used up (single transaction)', () => {
    const { ballots, guard } = setup();
    const t = newToken();
    const spy = jest.spyOn(ballots, 'add').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    expect(() => guard.accept(t, ['A'])).toThrow('disk full');
    expect(guard.isConsumed(t)).toBe(false);
    spy.mockRestore();
    guard.accept(t, ['A']); // the voter can still submit
    expect(ballots.count()).toBe(1);
  });

  test('the database itself enforces uniqueness, even if application checks are bypassed', () => {
    const { db } = setup();
    const insert = db.prepare('INSERT INTO consumed_tokens (token_hash) VALUES (?)');
    insert.run('abc');
    expect(() => insert.run('abc')).toThrow(/UNIQUE|PRIMARY KEY/);
  });
});

describe('SR-07 ballot intake API', () => {
  async function openContest() {
    const ctx = makeApp();
    await request(ctx.app)
      .post('/contest')
      .set('Authorization', bearer('admin'))
      .send({ candidates: ['Alice', 'Bob', 'Carol'] })
      .expect(201);
    return ctx;
  }

  test('a fresh token gets 201, a replayed token gets 409', async () => {
    const { app } = await openContest();
    const ballot = { token: newToken(), preferences: ['Alice', 'Carol'] };
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send(ballot).expect(201);
    const res = await request(app).post('/ballots').set('Authorization', bearer('admin')).send(ballot).expect(409);
    expect(res.body.error).toMatch(/already been used/);
  });

  test('a rejected replay is written to the audit log without the token', async () => {
    const { app, db } = await openContest();
    const ballot = { token: newToken(), preferences: ['Bob'] };
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send(ballot);
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send(ballot);
    const rows = db.prepare("SELECT details FROM audit_log WHERE action = 'BALLOT_REPLAY_REJECTED'").all() as { details: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).not.toContain(ballot.token);
  });

  test('accepted ballots are not individually logged (would undo SR-03)', async () => {
    const { app, db } = await openContest();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/ballots').set('Authorization', bearer('admin')).send({ token: newToken(), preferences: ['Alice'] }).expect(201);
    }
    const actions = (db.prepare('SELECT action FROM audit_log').all() as { action: string }[]).map((r) => r.action);
    expect(actions).toEqual(['CONTEST_OPENED']);
  });

  test.each([
    ['token too short', { token: 'abc', preferences: ['Alice'] }],
    ['token with illegal characters', { token: "' OR 1=1 --aaaaaaaaaaaaaaaa", preferences: ['Alice'] }],
    ['unknown candidate', { token: 'x'.repeat(22), preferences: ['Mallory'] }],
    ['candidate ranked twice', { token: 'x'.repeat(22), preferences: ['Alice', 'Alice'] }],
    ['empty ballot', { token: 'x'.repeat(22), preferences: [] }],
    ['unexpected extra field', { token: 'x'.repeat(22), preferences: ['Alice'], voterId: 'v-1' }],
  ])('rejects a malformed ballot with 400: %s', async (_label, body) => {
    const { app } = await openContest();
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send(body).expect(400);
  });

  test('error messages do not echo unexpected field names back (no reflected XSS)', async () => {
    const { app } = await openContest();
    const res = await request(app)
      .post('/ballots')
      .set('Authorization', bearer('admin'))
      .send({ token: 'x'.repeat(22), preferences: ['Alice'], '<script>alert(1)</script>': 1 })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain('<script>');
  });

  test('a malformed ballot does not use up its token', async () => {
    const { app } = await openContest();
    const token = newToken();
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send({ token, preferences: ['Nobody'] }).expect(400);
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send({ token, preferences: ['Bob'] }).expect(201);
  });

  test('ballots are refused before the contest is opened', async () => {
    const { app } = makeApp();
    await request(app).post('/ballots').set('Authorization', bearer('admin')).send({ token: newToken(), preferences: ['A'] }).expect(409);
  });

  test('only the ballot feed (admin) can submit ballots', async () => {
    const { app } = await openContest();
    await request(app).post('/ballots').set('Authorization', bearer('delegate')).send({ token: newToken(), preferences: ['Alice'] }).expect(403);
  });

  test('candidates cannot be changed once the contest is open', async () => {
    const { app } = await openContest();
    await request(app).post('/contest').set('Authorization', bearer('admin')).send({ candidates: ['X', 'Y'] }).expect(409);
  });
});
