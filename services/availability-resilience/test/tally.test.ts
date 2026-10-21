import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openTallyDb, TallyDb } from '../src/db/tallyDb';
import { createApp } from '../src/app';

// Stand-in RBAC so these tests don't depend on Rita's login/JWT setup.
// The role comes from an x-test-role header.
jest.mock('../src/rbac', () => {
  const make = (allowed: string[]) => (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ error: 'unauthenticated' });
    if (!allowed.includes(role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
  return {
    requireTallyWrite: make(['admin', 'delegate']),
    requireTallyRead: make(['admin', 'delegate', 'auditor']),
  };
});

let dir: string;
let db: TallyDb;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tally-'));
  db = openTallyDb(path.join(dir, 'tally.db'));
  app = createApp(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const rowCount = () => (db.prepare('SELECT COUNT(*) AS n FROM tally').get() as { n: number }).n;

describe('tally write restrictions', () => {
  it('rejects an auditor write with 403 and leaves the database unchanged', async () => {
    const res = await request(app)
      .post('/tally')
      .set('x-test-role', 'auditor')
      .send({ candidate: 'Alice', count: 10 });
    expect(res.status).toBe(403);
    expect(rowCount()).toBe(0);
  });

  it('rejects an unauthenticated write with 401', async () => {
    const res = await request(app).post('/tally').send({ candidate: 'Alice', count: 10 });
    expect(res.status).toBe(401);
    expect(rowCount()).toBe(0);
  });
});

describe('tally permitted access', () => {
  it.each(['admin', 'delegate'])('allows %s to write', async (role) => {
    const res = await request(app)
      .post('/tally')
      .set('x-test-role', role)
      .send({ candidate: 'Alice', count: 7 });
    expect(res.status).toBe(201);
    expect(rowCount()).toBe(1);
  });

  it('allows an auditor to read tally results', async () => {
    await request(app).post('/tally').set('x-test-role', 'admin').send({ candidate: 'Alice', count: 7 });
    const res = await request(app).get('/tally').set('x-test-role', 'auditor');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ candidate: 'Alice', count: 7 });
  });

  it('rejects invalid input with 400', async () => {
    const res = await request(app)
      .post('/tally')
      .set('x-test-role', 'admin')
      .send({ candidate: '', count: -1 });
    expect(res.status).toBe(400);
  });
});

describe('tally database separation', () => {
  it('lives in its own file and contains only the tally table', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((t) => t.name);
    expect(tables).toEqual(['tally']);
    expect(fs.existsSync(path.join(dir, 'tally.db'))).toBe(true);
  });
});