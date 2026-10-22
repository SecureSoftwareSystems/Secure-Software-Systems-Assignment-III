import express, { type NextFunction, type Request, type Response } from 'express';
import type { DB } from './db';
import { AuditLog } from './audit/auditLog';
import { actor, createServiceAuth } from './auth';
import { BallotStore } from './ballots';
import { ContestError, ContestStore } from './contest';
import { ReplayError, ReplayGuard, hashToken } from './tokens/replayGuard';
import { ballotSchema, describeIssues, openContestSchema } from './validation';
import { hashBallotSet, verifiedCount } from './counting/comparator';
import { countIrvEngineA } from './counting/irvEngineA';
import { countIrvEngineB } from './counting/irvEngineB';
import { ResultStore } from './counting/results';
import type { CountingEngine } from './counting/types';

export interface AppDeps {
  db: DB;
  jwtSigningKey: string;
  auditHmacKey: string;
  engines?: { a: CountingEngine; b: CountingEngine };
}

export function createApp({
  db,
  jwtSigningKey,
  auditHmacKey,
  engines = { a: countIrvEngineA, b: countIrvEngineB },
}: AppDeps) {
  const app = express();
  const audit = new AuditLog(db);
  const contest = new ContestStore(db);
  const ballots = new BallotStore(db);
  const replayGuard = new ReplayGuard(db, ballots);
  const results = new ResultStore(db);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const { authenticate: auth, requireRole } = createServiceAuth(jwtSigningKey);

  app.get('/audit', auth, requireRole('auditor', 'admin'), (req, res) => {
    audit.append(actor(req.user), 'AUDIT_LOG_VIEWED');
    res.json({ entries: audit.entries() });
  });

  app.get('/audit/verify', auth, requireRole('auditor', 'admin'), (req, res) => {
    const result = audit.verifyChain();
    res.status(result.valid ? 200 : 409).json(result);
  });

  app.post('/audit/checkpoint', auth, requireRole('admin'), (req, res) => {
    const cp = audit.checkpoint(auditHmacKey);
    audit.append(actor(req.user), 'AUDIT_CHECKPOINT_TAKEN', { seq: cp.seq, hash: cp.hash });
    res.status(201).json(cp);
  });

  app.get('/contest', auth, (_req, res) => {
    res.json(contest.get());
  });

  app.post('/contest', auth, requireRole('admin'), (req, res) => {
    const parsed = openContestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request', issues: describeIssues(parsed.error) });
      return;
    }
    try {
      const opened = contest.open(parsed.data.candidates);
      audit.append(actor(req.user), 'CONTEST_OPENED', { candidates: opened.candidates });
      res.status(201).json(opened);
    } catch (err) {
      if (err instanceof ContestError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // SR-03: accepted ballots are not logged one by one, so voting order is never recorded.
  app.post('/ballots', auth, requireRole('admin'), (req, res) => {
    const current = contest.get();
    if (current.status !== 'open') {
      res.status(409).json({ error: 'ballot intake is not open' });
      return;
    }
    const parsed = ballotSchema(current.candidates).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid ballot', issues: describeIssues(parsed.error) });
      return;
    }
    try {
      replayGuard.accept(parsed.data.token, parsed.data.preferences);
      res.status(201).json({ accepted: true });
    } catch (err) {
      if (err instanceof ReplayError) {
        audit.append(actor(req.user), 'BALLOT_REPLAY_REJECTED', { tokenHashPrefix: hashToken(parsed.data.token).slice(0, 12) });
        res.status(409).json({ error: 'ballot token has already been used' });
        return;
      }
      throw err;
    }
  });

  app.post('/contest/close', auth, requireRole('admin'), (req, res) => {
    try {
      contest.close();
      audit.append(actor(req.user), 'CONTEST_CLOSED', { ballotCount: ballots.count() });
      res.json(contest.get());
    } catch (err) {
      if (err instanceof ContestError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  app.post('/count', auth, requireRole('delegate', 'admin'), (req, res) => {
    const current = contest.get();
    if (current.status !== 'closed') {
      res.status(409).json({ error: 'ballot intake must be closed before counting' });
      return;
    }

    const batch = ballots.batchForCounting();
    if (batch.length === 0) {
      res.status(409).json({ error: 'no ballots to count' });
      return;
    }
    const ballotSetHash = hashBallotSet(batch);
    audit.append(actor(req.user), 'COUNT_STARTED', { ballotCount: batch.length, ballotSetHash });

    const outcome = verifiedCount(current.candidates, batch, engines.a, engines.b);

    if (outcome.status === 'MISMATCH') {
      // SR-10 fail safe: on a mismatch no result is stored or returned.
      audit.append(actor(req.user), 'COUNT_MISMATCH', { discrepancies: outcome.discrepancies.slice(0, 20) });
      res.status(409).json({ status: 'HALTED', error: 'counting engines disagree; result withheld', discrepancies: outcome.discrepancies });
      return;
    }

    results.save(outcome.result, outcome.resultHash, ballotSetHash);
    const entry = audit.append(actor(req.user), 'COUNT_VERIFIED', {
      winner: outcome.result.winner,
      rounds: outcome.result.rounds.length,
      resultHash: outcome.resultHash,
      ballotSetHash,
    });
    res.json({ ...outcome, ballotSetHash, auditSeq: entry.seq });
  });

  app.get('/results/latest', auth, requireRole('delegate', 'auditor', 'admin'), (_req, res) => {
    const latest = results.latest();
    if (!latest) {
      res.status(404).json({ error: 'no verified result yet' });
      return;
    }
    res.json(latest);
  });

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
