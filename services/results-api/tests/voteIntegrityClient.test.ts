import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { IntegrityError, VoteIntegrityClient } from '../src/resultsSource';
import { JWT_KEY, verified } from './helpers';

/** A stand-in vote-integrity service on a random local port. */
function fakeVoteIntegrity(handler: express.RequestHandler): Promise<{ url: string; server: Server }> {
  const app = express();
  app.get('/results/latest', handler);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server });
    });
  });
}

describe('VoteIntegrityClient (service-to-service call)', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  test('calls vote-integrity with a short-lived, read-only auditor token', async () => {
    let seen: jwt.JwtPayload | undefined;
    const fake = await fakeVoteIntegrity((req, res) => {
      seen = jwt.verify(req.headers.authorization!.split(' ')[1]!, JWT_KEY, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      res.json(verified());
    });
    server = fake.server;
    const out = await new VoteIntegrityClient(fake.url, JWT_KEY).latest();
    expect(out?.result.winner).toBe('Knoxville');
    expect(seen).toMatchObject({ sub: 'svc:results-api', role: 'auditor' });
    expect(seen!.exp! - seen!.iat!).toBeLessThanOrEqual(60);
  });

  test('rejects a response that was altered in transit', async () => {
    const fake = await fakeVoteIntegrity((_req, res) => {
      const v = verified();
      v.result.winner = 'Nashville';
      res.json(v);
    });
    server = fake.server;
    await expect(new VoteIntegrityClient(fake.url, JWT_KEY).latest()).rejects.toThrow(IntegrityError);
  });

  test('maps 404 to "no result yet"', async () => {
    const fake = await fakeVoteIntegrity((_req, res) => {
      res.status(404).json({ error: 'no verified result yet' });
    });
    server = fake.server;
    expect(await new VoteIntegrityClient(fake.url, JWT_KEY).latest()).toBeNull();
  });
});
