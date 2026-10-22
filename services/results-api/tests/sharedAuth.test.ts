import jwt from 'jsonwebtoken';
import request from 'supertest';
import { BEFORE, JWT_KEY, bearer, makeApp } from './helpers';

describe('shared auth middleware (services/shared-auth)', () => {
  test('accepts a token shaped like auth-access-control login tokens', async () => {
    await request(makeApp({ at: BEFORE })).get('/results/full').set('Authorization', bearer('auditor')).expect(200);
  });

  test('rejects a validly signed token with an unknown role', async () => {
    const bad = jwt.sign({ sub: 9, role: 'superuser' }, JWT_KEY, { algorithm: 'HS256', expiresIn: '15m' });
    await request(makeApp({ at: BEFORE })).get('/results/full').set('Authorization', `Bearer ${bad}`).expect(401);
  });

  test('rejects an expired token (SR-17)', async () => {
    const old = jwt.sign({ sub: 4, role: 'auditor' }, JWT_KEY, { algorithm: 'HS256', expiresIn: -10 });
    await request(makeApp({ at: BEFORE })).get('/results/full').set('Authorization', `Bearer ${old}`).expect(401);
  });
});
