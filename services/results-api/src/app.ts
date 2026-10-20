import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate, requireRole } from './auth';
import { IntegrityError, SourceUnavailableError, assertIntegrity, type ResultsSource, type VerifiedResult } from './resultsSource';
import { fullView, publicView } from './views';

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
  app.use(express.json({ limit: '10kb' }));

  const isReleased = () => now().getTime() >= releaseAt.getTime();

  // Check the hash on every result before it leaves this service, whatever the source.
  const latestVerified = async (): Promise<VerifiedResult | null> => {
    const v = await source.latest();
    return v ? assertIntegrity(v) : null;
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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- SR-11 public results: release-time gated, public scope only ----
  app.get('/public/results', publicLimiter, async (_req, res, next) => {
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
  app.get('/results/full', privilegedLimiter, auth, requireRole('delegate', 'auditor', 'admin'), async (_req, res, next) => {
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
  });

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
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'malformed JSON body' });
      return;
    }
    console.error('[results-api] unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
