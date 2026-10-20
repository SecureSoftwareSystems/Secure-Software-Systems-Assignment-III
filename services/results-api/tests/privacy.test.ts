import request from 'supertest';
import { DecryptionError, FieldCipher, parseKey } from '../src/crypto/fieldEncryption';
import { hashApiKey } from '../src/clients';
import { AFTER, BEFORE, DATA_KEY, bearer, makeApp, makeClients } from './helpers';

describe('SR-20 field encryption (AES-256-GCM)', () => {
  const cipher = new FieldCipher(DATA_KEY);

  test('round-trips a value', () => {
    expect(cipher.decrypt(cipher.encrypt('press@news.example', 'row-1'), 'row-1')).toBe('press@news.example');
  });

  test('the stored value does not contain the plaintext', () => {
    const stored = cipher.encrypt('press@news.example', 'row-1');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('press');
    expect(Buffer.from(stored.slice(3), 'base64').toString('latin1')).not.toContain('press@news.example');
  });

  test('the same plaintext encrypts differently every time (random IV)', () => {
    expect(cipher.encrypt('same@x.example', 'r')).not.toBe(cipher.encrypt('same@x.example', 'r'));
  });

  test('a changed ciphertext is detected (GCM tag), not silently decrypted', () => {
    const stored = cipher.encrypt('press@news.example', 'row-1');
    const raw = Buffer.from(stored.slice(3), 'base64');
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0x01;
    expect(() => cipher.decrypt(`v1:${raw.toString('base64')}`, 'row-1')).toThrow(DecryptionError);
  });

  test('a ciphertext moved to a different row will not decrypt (AAD binds it to its row)', () => {
    const stored = cipher.encrypt('press@news.example', 'row-1');
    expect(() => cipher.decrypt(stored, 'row-2')).toThrow(DecryptionError);
  });

  test('the wrong key cannot decrypt', () => {
    const stored = cipher.encrypt('press@news.example', 'row-1');
    expect(() => new FieldCipher('b2'.repeat(32)).decrypt(stored, 'row-1')).toThrow(DecryptionError);
  });

  test('refuses a key that is not 256 bits', () => {
    expect(() => parseKey('abcd')).toThrow(/64 hex/);
    expect(() => parseKey(undefined)).toThrow(/64 hex/);
  });
});

describe('SR-20 API client registry: what is stored', () => {
  test('the contact email is encrypted and the API key is stored only as a hash', () => {
    const { db, store } = makeClients();
    const { apiKey } = store.create({ name: 'Daily Ledger', organisation: 'Ledger Media', contactEmail: 'results@ledger.example' });
    const raw = JSON.stringify(db.prepare('SELECT * FROM api_clients').all());
    expect(raw).not.toContain('results@ledger.example');
    expect(raw).not.toContain(apiKey);
    expect(raw).toContain(hashApiKey(apiKey));
    expect(store.list()[0]!.contactEmail).toBe('results@ledger.example'); // admins can still read it
  });

  test('only the columns listed in the privacy review exist', () => {
    const { db } = makeClients();
    const cols = (db.prepare("SELECT name FROM pragma_table_info('api_clients')").all() as { name: string }[]).map((c) => c.name);
    expect(cols.sort()).toEqual(['contact_email_enc', 'created_at', 'id', 'key_hash', 'name', 'organisation', 'revoked_at']);
  });

  test('a revoked key no longer works', () => {
    const { store } = makeClients();
    const { id, apiKey } = store.create({ name: 'A', organisation: 'B', contactEmail: 'a@b.example' });
    expect(store.findByKey(apiKey)).toBeDefined();
    expect(store.revoke(id)).toBe(true);
    expect(store.findByKey(apiKey)).toBeUndefined();
  });
});

describe('SR-20 admin API and the client results feed', () => {
  function setup(at = AFTER) {
    const { store } = makeClients();
    return { store, app: makeApp({ clients: store, at, limits: { public: 100, privileged: 100, feed: 2 } }) };
  }
  const client = { name: 'Daily Ledger', organisation: 'Ledger Media', contactEmail: 'Results@Ledger.example' };

  test('only admins can register clients; the key is returned once and never listed', async () => {
    const { app } = setup();
    await request(app).post('/admin/api-clients').set('Authorization', bearer('auditor')).send(client).expect(403);
    const created = await request(app).post('/admin/api-clients').set('Authorization', bearer('admin')).send(client).expect(201);
    expect(created.body.apiKey).toMatch(/^rk_[A-Za-z0-9_-]{43}$/);
    expect(created.headers['cache-control']).toBe('no-store');

    const list = await request(app).get('/admin/api-clients').set('Authorization', bearer('admin')).expect(200);
    expect(list.body.clients[0].contactEmail).toBe('results@ledger.example'); // normalised to lower case
    expect(JSON.stringify(list.body)).not.toContain(created.body.apiKey);
  });

  test.each([
    ['invalid email', { ...client, contactEmail: 'not-an-email' }],
    ['extra personal data the service does not need', { ...client, phone: '0400 000 000' }],
    ['script in a name', { ...client, name: '<script>alert(1)</script>' }],
    ['missing field', { name: 'X', organisation: 'Y' }],
  ])('rejects %s with 400 (SR-18)', async (_label, body) => {
    const { app } = setup();
    await request(app).post('/admin/api-clients').set('Authorization', bearer('admin')).send(body).expect(400);
  });

  test('a registered client gets the full feed after release, but not before', async () => {
    const before = setup(BEFORE);
    const { apiKey } = before.store.create(client);
    await request(before.app).get('/results/feed').set('X-API-Key', apiKey).expect(403);

    const after = setup(AFTER);
    const k2 = after.store.create(client).apiKey;
    const res = await request(after.app).get('/results/feed').set('X-API-Key', k2).expect(200);
    expect(res.body.roundByRound).toHaveLength(3);
  });

  test('unknown, malformed and revoked keys are refused', async () => {
    const { app, store } = setup();
    await request(app).get('/results/feed').set('X-API-Key', `rk_${'A'.repeat(43)}`).expect(401);
    await request(app).get('/results/feed').set('X-API-Key', 'guess').expect(400);
    const { id, apiKey } = store.create(client);
    await request(app).delete(`/admin/api-clients/${id}`).set('Authorization', bearer('admin')).expect(204);
    await request(app).get('/results/feed').set('X-API-Key', apiKey).expect(401);
  });

  test('revoking needs a valid client id', async () => {
    const { app } = setup();
    await request(app).delete('/admin/api-clients/not-a-uuid').set('Authorization', bearer('admin')).expect(400);
    await request(app).delete('/admin/api-clients/6f1c2a54-3a2e-4c49-9d1b-3c1d2f1e9a10').set('Authorization', bearer('admin')).expect(404);
  });

  test('each client has its own rate limit (SR-11)', async () => {
    const { app, store } = setup();
    const a = store.create(client).apiKey;
    const b = store.create({ ...client, name: 'Other Outlet' }).apiKey;
    await request(app).get('/results/feed').set('X-API-Key', a).expect(200);
    await request(app).get('/results/feed').set('X-API-Key', a).expect(200);
    await request(app).get('/results/feed').set('X-API-Key', a).expect(429);
    await request(app).get('/results/feed').set('X-API-Key', b).expect(200); // b is unaffected
  });
});
