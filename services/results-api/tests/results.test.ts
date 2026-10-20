import request from 'supertest';
import { assertIntegrity, IntegrityError, SourceUnavailableError } from '../src/resultsSource';
import { AFTER, BEFORE, RELEASE_AT, bearer, makeApp, sourceOf, verified } from './helpers';

describe('SR-11 release-time gating', () => {
  test('before the release time the public gets 403 and no result data', async () => {
    const res = await request(makeApp({ at: BEFORE })).get('/public/results').expect(403);
    expect(res.body).toEqual({ status: 'NOT_YET_RELEASED', releaseAt: RELEASE_AT.toISOString() });
    expect(JSON.stringify(res.body)).not.toContain('Knoxville');
    expect(res.headers['cache-control']).toBe('no-store'); // a proxy must not cache the embargo answer
  });

  test('results become public exactly at the release time', async () => {
    await request(makeApp({ at: RELEASE_AT })).get('/public/results').expect(200);
  });

  test('after release the public gets the winner and final tallies only (public scope)', async () => {
    const res = await request(makeApp({ at: AFTER })).get('/public/results').expect(200);
    expect(res.body).toMatchObject({ status: 'RELEASED', winner: 'Knoxville', totalBallots: 100, rounds: 3 });
    expect(res.body.finalTallies).toEqual({ Memphis: 42, Knoxville: 58 });
    expect(res.body).not.toHaveProperty('roundByRound');
    expect(res.body).not.toHaveProperty('ballotSetHash');
  });

  test('404 when nothing has been counted yet', async () => {
    await request(makeApp({ source: sourceOf(null) })).get('/public/results').expect(404);
  });
});

describe('SR-11 scoped access', () => {
  test('scrutineers and auditors can see full round-by-round results before release, marked EMBARGOED', async () => {
    const app = makeApp({ at: BEFORE });
    for (const role of ['delegate', 'auditor', 'admin'] as const) {
      const res = await request(app).get('/results/full').set('Authorization', bearer(role)).expect(200);
      expect(res.body.status).toBe('EMBARGOED');
      expect(res.body.roundByRound).toHaveLength(3);
    }
  });

  test('the full scope needs a valid token', async () => {
    const app = makeApp({ at: BEFORE });
    await request(app).get('/results/full').expect(401);
    await request(app).get('/results/full').set('Authorization', bearer('auditor', 'attacker-key-that-is-long-enough-000000')).expect(401);
  });
});

describe('SR-11 rate limiting', () => {
  test('a client over its per-minute budget gets 429, with standard RateLimit headers', async () => {
    const app = makeApp({ limits: { public: 3, privileged: 3 } });
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).get('/public/results').expect(200);
      expect(ok.headers['ratelimit']).toBeDefined();
    }
    const res = await request(app).get('/public/results').expect(429);
    expect(res.body.error).toMatch(/too many requests/);
  });

  test('a spoofed X-Forwarded-For header does not get around the limit when no proxy is trusted', async () => {
    const app = makeApp({ limits: { public: 2, privileged: 2 }, trustProxy: 0 });
    for (let i = 0; i < 2; i++) await request(app).get('/public/results').set('X-Forwarded-For', `203.0.113.${i}`).expect(200);
    await request(app).get('/public/results').set('X-Forwarded-For', '203.0.113.99').expect(429);
  });

  test('behind one trusted proxy, different real clients get separate budgets', async () => {
    const app = makeApp({ limits: { public: 1, privileged: 1 }, trustProxy: 1 });
    await request(app).get('/public/results').set('X-Forwarded-For', '198.51.100.1').expect(200);
    await request(app).get('/public/results').set('X-Forwarded-For', '198.51.100.1').expect(429);
    await request(app).get('/public/results').set('X-Forwarded-For', '198.51.100.2').expect(200);
  });
});

describe('SR-11 result integrity', () => {
  test('a result that doesn\'t match its recorded hash is never published (502)', async () => {
    const tampered = verified();
    tampered.result.winner = 'Memphis';
    const res = await request(makeApp({ source: sourceOf(tampered) })).get('/public/results').expect(502);
    expect(JSON.stringify(res.body)).not.toContain('Memphis');
  });

  test('assertIntegrity accepts the genuine result and rejects a single changed vote', () => {
    expect(() => assertIntegrity(verified())).not.toThrow();
    const v = verified();
    v.result.rounds[2]!.tallies.Knoxville = 59;
    expect(() => assertIntegrity(v)).toThrow(IntegrityError);
  });

  test('if vote-integrity is down, the API says so (503) without leaking details', async () => {
    const down = { latest: async () => { throw new SourceUnavailableError('ECONNREFUSED 127.0.0.1:4002'); } };
    const res = await request(makeApp({ source: down })).get('/public/results').expect(503);
    expect(JSON.stringify(res.body)).not.toContain('4002');
  });
});

