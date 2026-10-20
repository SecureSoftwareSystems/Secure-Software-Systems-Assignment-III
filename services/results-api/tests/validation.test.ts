import request from 'supertest';
import { z } from 'zod';
import express from 'express';
import { validate } from '../src/validation';
import { BEFORE, bearer, makeApp, sourceOf, verified } from './helpers';

describe('SR-18 input validation on every route', () => {
  test.each([
    ['/health?debug=1'],
    ['/public/results?contest=1'],
    ['/public/results?winner=Memphis'],
    ['/public/results?a[b]=1'], // nested-object style query (prototype-pollution vector)
    ['/public/results?__proto__=x'],
  ])('unexpected query parameters are rejected with 400: %s', async (url) => {
    const res = await request(makeApp()).get(url).expect(400);
    expect(res.body.error).toBe('invalid request');
  });

  test('a malformed Authorization header gets 400 before any token checking', async () => {
    const app = makeApp({ at: BEFORE });
    await request(app).get('/results/full').set('Authorization', "Bearer ' OR 1=1 --").expect(400);
    await request(app).get('/results/full').set('Authorization', 'Basic YWRtaW46YWRtaW4=').expect(400);
    await request(app).get('/results/full').set('Authorization', `Bearer a.${'b'.repeat(3000)}.c`).expect(400);
  });

  test('a well-formed request still passes validation', async () => {
    await request(makeApp({ at: BEFORE })).get('/results/full').set('Authorization', bearer('auditor')).expect(200);
  });

  test('malformed JSON gets 400, not 500', async () => {
    const res = await request(makeApp()).post('/public/results').set('Content-Type', 'application/json').send('{"oops":').expect(400);
    expect(res.body.error).toBe('malformed JSON body');
  });

  test('an oversized body gets 413, not 500', async () => {
    const big = JSON.stringify({ x: 'a'.repeat(20_000) });
    await request(makeApp()).post('/public/results').set('Content-Type', 'application/json').send(big).expect(413);
  });

  test('error responses do not echo the caller\'s input back', async () => {
    const res = await request(makeApp()).get('/public/results?<script>alert(1)</script>=1').expect(400);
    expect(JSON.stringify(res.body)).not.toContain('<script>');
  });
});

describe('SR-18 upstream data is validated too', () => {
  test('a malformed result from vote-integrity is refused (502) rather than published', async () => {
    const bad = { ...verified(), result: { winner: 'Knoxville' } } as unknown as ReturnType<typeof verified>;
    await request(makeApp({ source: sourceOf(bad) })).get('/public/results').expect(502);
  });

  test('extra unexpected fields from upstream are refused', async () => {
    const extra = { ...verified(), voterList: ['alice@example.com'] } as unknown as ReturnType<typeof verified>;
    await request(makeApp({ source: sourceOf(extra) })).get('/public/results').expect(502);
  });
});

describe('SR-18 validate() middleware', () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/t/:id',
    validate({
      params: z.object({ id: z.string().uuid() }).strict(),
      body: z.object({ n: z.number().int().min(1).max(10) }).strict(),
    }),
    (req, res) => {
      res.json({ id: req.params.id, n: req.body.n, type: typeof req.body.n });
    },
  );
  const id = '6f1c2a54-3a2e-4c49-9d1b-3c1d2f1e9a10';

  test('passes validated, typed values to the handler', async () => {
    const res = await request(app).post(`/t/${id}`).send({ n: 5 }).expect(200);
    expect(res.body).toEqual({ id, n: 5, type: 'number' });
  });

  test.each([
    ['bad path parameter', '/t/not-a-uuid', { n: 5 }],
    ['wrong type', `/t/${id}`, { n: '5' }],
    ['out of range', `/t/${id}`, { n: 11 }],
    ['unknown field', `/t/${id}`, { n: 5, isAdmin: true }],
  ])('rejects %s with 400', async (_label, url, body) => {
    await request(app).post(url).send(body).expect(400);
  });
});
