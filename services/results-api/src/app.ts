import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createServiceAuth } from './auth';
import { IntegrityError, SourceUnavailableError, assertIntegrity, type ResultsSource, type VerifiedResult } from './resultsSource';
import { fullView, publicView } from './views';
import { authHeaderSchema, noQuery, upstreamResultSchema, validate } from './validation';
import type { ApiClientStore } from './clients';
import { DecryptionError } from './crypto/fieldEncryption';
import { z } from 'zod';

export interface AppDeps {
  source: ResultsSource;
  clients: ApiClientStore;
  jwtSigningKey: string;
  releaseAt: Date;
  now?: () => Date;
  trustProxy?: number;
  limits?: { public: number; privileged: number; feed?: number };
}

export function createApp({
  source,
  clients,
  jwtSigningKey,
  releaseAt,
  now = () => new Date(),
  trustProxy = 0,
  limits = { public: 60, privileged: 300, feed: 120 },
}: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.set('query parser', 'simple');
  app.use(express.json({ limit: '10kb', strict: true }));

  const isReleased = () => now().getTime() >= releaseAt.getTime();

  const latestVerified = async (): Promise<VerifiedResult | null> => {
    const v = await source.latest();
    if (!v) return null;
    const shape = upstreamResultSchema.safeParse(v);
    if (!shape.success) throw new IntegrityError('result from vote-integrity is malformed');
    return assertIntegrity(v);
  };

  const limiter = (limit: number, keyGenerator?: (req: Request) => string) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      ...(keyGenerator ? { keyGenerator } : {}),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: 'too many requests, slow down' });
      },
    });
  const publicLimiter = limiter(limits.public);
  const privilegedLimiter = limiter(limits.privileged);

  app.get('/health', validate({ query: noQuery }), (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/public/results', publicLimiter, validate({ query: noQuery }), async (_req, res, next) => {
    try {
      if (!isReleased()) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(403).json({ status: 'NOT_YET_RELEASED', releaseAt: releaseAt.toISOString() });
        return;
      }
      const latest = await latestVerified();
      if (!latest) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(404).json({ status: 'NO_RESULT' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({ status: 'RELEASED', ...publicView(latest) });
    } catch (err) {
      next(err);
    }
  });

  const { authenticate: auth, requireRole } = createServiceAuth(jwtSigningKey);
  app.get(
    '/results/full',
    privilegedLimiter,
    validate({ query: noQuery, headers: authHeaderSchema }),
    auth,
    requireRole('delegate', 'auditor', 'admin'),
    async (_req, res, next) => {
      try {
        const latest = await latestVerified();
        res.setHeader('Cache-Control', 'no-store');
        if (!latest) {
          res.status(404).json({ status: 'NO_RESULT' });
          return;
        }
        res.json({ status: isReleased() ? 'RELEASED' : 'EMBARGOED', ...fullView(latest) });
      } catch (err) {
        next(err);
      }
    },
  );

  const safeText = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} .,'&()-]+$/u, 'letters, digits and basic punctuation only');
  const newClientSchema = z
    .object({ name: safeText, organisation: safeText, contactEmail: z.string().trim().toLowerCase().email().max(254) })
    .strict();
  const clientIdParams = z.object({ id: z.string().uuid() }).strict();
  const adminOnly = [privilegedLimiter, validate({ headers: authHeaderSchema }), auth, requireRole('admin')];

  app.post('/admin/api-clients', ...adminOnly, validate({ query: noQuery, body: newClientSchema }), (req, res) => {
    const created = clients.create(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ ...created, note: 'Give this key to the client now. It is not stored and cannot be shown again.' });
  });

  app.get('/admin/api-clients', ...adminOnly, validate({ query: noQuery }), (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ clients: clients.list() });
  });

  app.delete('/admin/api-clients/:id', ...adminOnly, validate({ params: clientIdParams, query: noQuery }), (req, res) => {
    if (!clients.revoke(req.params.id!)) {
      res.status(404).json({ error: 'no active client with that id' });
      return;
    }
    res.status(204).end();
  });

  const apiKeyHeader = z.object({ 'x-api-key': z.string().regex(/^rk_[A-Za-z0-9_-]{43}$/, 'invalid API key format') }).passthrough();
  app.get(
    '/results/feed',
    validate({ query: noQuery, headers: apiKeyHeader }),
    (req, res, next) => {
      const client = clients.findByKey(String(req.headers['x-api-key']));
      if (!client) {
        res.status(401).json({ error: 'unknown or revoked API key' });
        return;
      }
      res.locals.clientId = client.id;
      next();
    },
    limiter(limits.feed ?? 120, (req) => `client:${(req.res?.locals.clientId as string) ?? 'none'}`), // one budget per client, not per IP
    async (_req, res, next) => {
      try {
        if (!isReleased()) {
          res.setHeader('Cache-Control', 'no-store');
          res.status(403).json({ status: 'NOT_YET_RELEASED', releaseAt: releaseAt.toISOString() });
          return;
        }
        const latest = await latestVerified();
        if (!latest) {
          res.status(404).json({ status: 'NO_RESULT' });
          return;
        }
        res.setHeader('Cache-Control', 'private, max-age=30');
        res.json({ status: 'RELEASED', ...fullView(latest) });
      } catch (err) {
        next(err);
      }
    },
  );

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DecryptionError) {
      console.error('[results-api] stored personal data failed to decrypt');
      res.status(500).json({ error: 'internal error' });
      return;
    }
    if (err instanceof IntegrityError) {
      console.error('[results-api] integrity check failed');
      res.status(502).json({ error: 'result failed integrity check; not published' });
      return;
    }
    if (err instanceof SourceUnavailableError) {
      res.status(503).json({ error: 'results temporarily unavailable' });
      return;
    }
    const status = (err as { status?: number; type?: string } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const type = (err as { type?: string }).type;
      const message =
        type === 'entity.too.large' ? 'request body too large' : type === 'entity.parse.failed' ? 'malformed JSON body' : 'bad request';
      res.status(status).json({ error: message });
      return;
    }
    console.error('[results-api] unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
