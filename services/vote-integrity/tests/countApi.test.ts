import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { openDatabase } from '../src/db';
import { createApp } from '../src/app';
import { AuditLog } from '../src/audit/auditLog';
import { countIrvEngineA } from '../src/counting/irvEngineA';
import type { CountingEngine } from '../src/counting/types';
import { HMAC_KEY, JWT_KEY, bearer } from './helpers';

const ADMIN = bearer('admin');

async function runElection(engines?: { a: CountingEngine; b: CountingEngine }) {
  const db = openDatabase();
  const app = createApp({ db, jwtSigningKey: JWT_KEY, auditHmacKey: HMAC_KEY, engines });
  await request(app).post('/contest').set('Authorization', ADMIN).send({ candidates: ['Alice', 'Bob', 'Carol'] }).expect(201);

  const votes: [string[], number][] = [
    [['Alice'], 4],
    [['Bob', 'Alice'], 3],
    [['Carol', 'Bob'], 2],
  ];
  for (const [prefs, n] of votes) {
    for (let i = 0; i < n; i++) {
      await request(app)
        .post('/ballots')
        .set('Authorization', ADMIN)
        .send({ token: randomBytes(16).toString('base64url'), preferences: prefs })
        .expect(201);
    }
  }
  return { db, app };
}

describe('SR-10 count API (end to end)', () => {
  test('counting is refused while ballot intake is still open', async () => {
    const { app } = await runElection();
    await request(app).post('/count').set('Authorization', bearer('delegate')).expect(409);
  });

  test('auditors cannot start a count (403)', async () => {
    const { app } = await runElection();
    await request(app).post('/contest/close').set('Authorization', ADMIN).expect(200);
    await request(app).post('/count').set('Authorization', bearer('auditor')).expect(403);
  });

  test('a delegate runs a verified count; result and hashes are recorded in the audit log', async () => {
    const { app, db } = await runElection();
    await request(app).post('/contest/close').set('Authorization', ADMIN).expect(200);

    const res = await request(app).post('/count').set('Authorization', bearer('delegate')).expect(200);
    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.result.winner).toBe('Bob');
    expect(res.body.result.totalBallots).toBe(9);

    const log = new AuditLog(db);
    const actions = log.entries().map((e) => e.action);
    expect(actions).toEqual(['CONTEST_OPENED', 'CONTEST_CLOSED', 'COUNT_STARTED', 'COUNT_VERIFIED']);
    const verified = JSON.parse(log.entries()[3]!.details);
    expect(verified.resultHash).toBe(res.body.resultHash);
    expect(log.verifyChain().valid).toBe(true);

    const latest = await request(app).get('/results/latest').set('Authorization', bearer('auditor')).expect(200);
    expect(latest.body.resultHash).toBe(res.body.resultHash);
  });

  test('ballots are refused after the contest is closed', async () => {
    const { app } = await runElection();
    await request(app).post('/contest/close').set('Authorization', ADMIN).expect(200);
    await request(app)
      .post('/ballots')
      .set('Authorization', ADMIN)
      .send({ token: randomBytes(16).toString('base64url'), preferences: ['Alice'] })
      .expect(409);
  });

  test('if the engines disagree, the count halts: no result is stored, and the halt is logged', async () => {
    const rigged: CountingEngine = (c, b) => ({ ...countIrvEngineA(c, b), winner: 'Carol' });
    const { app, db } = await runElection({ a: countIrvEngineA, b: rigged });
    await request(app).post('/contest/close').set('Authorization', ADMIN).expect(200);

    const res = await request(app).post('/count').set('Authorization', bearer('delegate')).expect(409);
    expect(res.body.status).toBe('HALTED');
    expect(res.body.discrepancies).toContain('winner: A=Bob B=Carol');

    await request(app).get('/results/latest').set('Authorization', bearer('auditor')).expect(404);
    const log = new AuditLog(db);
    expect(log.entries().map((e) => e.action)).toContain('COUNT_MISMATCH');
    expect(log.verifyChain().valid).toBe(true);
  });

  test('the same ballots always give the same result hash, whatever the shuffle', async () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const { app } = await runElection();
      await request(app).post('/contest/close').set('Authorization', ADMIN);
      const res = await request(app).post('/count').set('Authorization', bearer('delegate')).expect(200);
      hashes.add(res.body.resultHash);
    }
    expect(hashes.size).toBe(1);
  });
});
