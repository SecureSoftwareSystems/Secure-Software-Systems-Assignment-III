import express, { type NextFunction, type Request, type Response } from 'express';
import type { DB } from './db';
import { AuditLog } from './audit/auditLog';
import { authenticate, requireRole } from './auth';

export interface AppDeps {
  db: DB;
  jwtSigningKey: string;
  auditHmacKey: string;
}

export function createApp({ db, jwtSigningKey, auditHmacKey }: AppDeps) {
  const app = express();
  const audit = new AuditLog(db);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const auth = authenticate(jwtSigningKey);

  // ---- SR-09 audit log ----
  app.get('/audit', auth, requireRole('auditor', 'admin'), (req, res) => {
    audit.append(req.user!.sub, 'AUDIT_LOG_VIEWED');
    res.json({ entries: audit.entries() });
  });

  app.get('/audit/verify', auth, requireRole('auditor', 'admin'), (req, res) => {
    const result = audit.verifyChain();
    res.status(result.valid ? 200 : 409).json(result);
  });

  app.post('/audit/checkpoint', auth, requireRole('admin'), (req, res) => {
    const cp = audit.checkpoint(auditHmacKey);
    audit.append(req.user!.sub, 'AUDIT_CHECKPOINT_TAKEN', { seq: cp.seq, hash: cp.hash });
    res.status(201).json(cp);
  });

  // Unknown routes and unexpected errors: generic messages only, no stack traces.
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'malformed JSON body' });
      return;
    }
    console.error('[vote-integrity] unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
