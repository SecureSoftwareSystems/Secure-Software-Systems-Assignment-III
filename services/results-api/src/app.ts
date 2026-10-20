import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate, requireRole } from './auth';
import { IntegrityError, SourceUnavailableError, assertIntegrity, type ResultsSource, type VerifiedResult } from './resultsSource';
import { fullView, publicView } from './views';
import { authHeaderSchema, noQuery, upstreamResultSchema, validate } from './validation';

export interface AppDeps {
  source: ResultsSource;
  jwtSigningKey: string;
  releaseAt: Date;
  now?: () => Date;
  trustProxy?: number;
  /** Requests per minute per client. Lowered in tests. */
  limits?: { public: number; privileged: number };
}

export function createApp({
  source,
  jwtSigningKey,
  releaseAt,
  now = () => new Date(),
  trustProxy = 0,
  limits = { public: 60, privileged: 300 },
}: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  // Behind the TLS proxy (SR-13), trust exactly that many hops so rate limiting keys on the real client IP.
  app.set('trust proxy', trustProxy);
  // SR-18: flat query strings only. The default parser turns ?a[b]=1 into nested
  // objects, a common route to prototype pollution and type confusion.
  app.set('query parser', 'simple');
  app.use(express.json({ limit: '10kb', strict: true }));

  const isReleased = () => now().getTime() >= releaseAt.getTime();

  // Check the hash on every result before it leaves this service, whatever the source.
  const latestVerified = async (): Promise<VerifiedResult | null> => {
    const v = await source.latest();
    if (!v) return null;
    // SR-18: the upstream response is input too. Check its shape, then its hash.
    const shape = upstreamResultSchema.safeParse(v);
    if (!shape.success) throw new IntegrityError('result from vote-integrity is malformed');
    return assertIntegrity(v);
  };

  // ---- SR-11 rate limiting: one budget per client IP, standard RateLimit headers, JSON 429 ----
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
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

  // ---- SR-11 public results: release-time gated, public scope only ----
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

  // ---- SR-11 privileged scope: scrutineers and auditors may verify before release ----
  const auth = authenticate(jwtSigningKey);
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

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof IntegrityError) {
      // Never publish a result that doesn't match its hash.
      console.error('[results-api] integrity check failed');
      res.status(502).json({ error: 'result failed integrity check; not published' });
      return;
    }
    if (err instanceof SourceUnavailableError) {
      res.status(503).json({ error: 'results temporarily unavailable' });
      return;
    }
    // Body-parser errors (bad JSON, too large, wrong charset) carry their own 4xx status:
    // answer with that status instead of a 500.
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
