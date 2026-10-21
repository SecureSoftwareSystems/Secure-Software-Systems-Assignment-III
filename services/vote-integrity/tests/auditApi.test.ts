import request from 'supertest';
import { JWT_KEY, bearer, makeApp, tokenFor } from './helpers';

describe('SR-09 audit log API', () => {
  test('requires a valid token (401 without one)', async () => {
    const { app } = makeApp();
    await request(app).get('/audit/verify').expect(401);
  });

  test('rejects a token signed with a different key', async () => {
    const { app } = makeApp();
    const forged = tokenFor('auditor', 'auditor-1', 'attacker-key-that-is-long-enough-000000');
    await request(app).get('/audit/verify').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  test('rejects an expired token', async () => {
    const { app } = makeApp();
    const expired = tokenFor('auditor', 'auditor-1', undefined, -10);
    await request(app).get('/audit/verify').set('Authorization', `Bearer ${expired}`).expect(401);
  });

  test('delegates cannot read the audit log (403), auditors can', async () => {
    const { app } = makeApp();
    await request(app).get('/audit').set('Authorization', bearer('delegate')).expect(403);
    const res = await request(app).get('/audit').set('Authorization', bearer('auditor')).expect(200);
    expect(res.body.entries).toHaveLength(1); // the view itself is logged
    expect(res.body.entries[0].action).toBe('AUDIT_LOG_VIEWED');
  });

  test('verify returns 409 once the chain has been tampered with', async () => {
    const { app, db } = makeApp();
    await request(app).get('/audit').set('Authorization', bearer('auditor'));
    await request(app).get('/audit').set('Authorization', bearer('admin'));
    await request(app).get('/audit/verify').set('Authorization', bearer('auditor')).expect(200);

    db.exec('DROP TRIGGER audit_log_no_update');
    db.prepare("UPDATE audit_log SET actor = 'mallory' WHERE seq = 1").run();

    const res = await request(app).get('/audit/verify').set('Authorization', bearer('auditor')).expect(409);
    expect(res.body).toMatchObject({ valid: false, firstInvalidSeq: 1 });
  });

  test('only admins can take a signed checkpoint', async () => {
    const { app } = makeApp();
    await request(app).post('/audit/checkpoint').set('Authorization', bearer('auditor')).expect(403);
    const res = await request(app).post('/audit/checkpoint').set('Authorization', bearer('admin')).expect(201);
    expect(res.body.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('shared auth middleware (services/shared-auth)', () => {
  test('accepts a token shaped like auth-access-control login tokens and logs the username as actor', async () => {
    const { app, db } = makeApp();
    await request(app).get('/audit').set('Authorization', bearer('auditor')).expect(200);
    const row = db.prepare('SELECT actor FROM audit_log WHERE seq = 1').get() as { actor: string };
    expect(row.actor).toBe('auditor-1');
  });

  test('rejects a validly signed token with an unknown role', async () => {
    const { app } = makeApp();
    const jwt = require('jsonwebtoken');
    const bad = jwt.sign({ sub: 9, role: 'superuser' }, JWT_KEY, { algorithm: 'HS256', expiresIn: '15m' });
    await request(app).get('/audit').set('Authorization', `Bearer ${bad}`).expect(401);
  });
});
