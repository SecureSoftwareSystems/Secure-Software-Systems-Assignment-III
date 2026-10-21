import { Request, Response, Router } from 'express';
import { TallyDb } from '../db/tallyDb';
import { requireTallyRead, requireTallyWrite } from '../rbac';

export function createTallyRouter(db: TallyDb): Router {
  const router = Router();

  router.get('/', requireTallyRead, (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT candidate, count, updated_at FROM tally ORDER BY candidate')
      .all();
    res.json(rows);
  });

  router.post('/', requireTallyWrite, (req: Request, res: Response) => {
    const { candidate, count } = req.body ?? {};
    if (
      typeof candidate !== 'string' ||
      candidate.trim() === '' ||
      !Number.isInteger(count) ||
      count < 0
    ) {
      res.status(400).json({ error: 'candidate (string) and count (integer >= 0) required' });
      return;
    }
    db.prepare(
      `INSERT INTO tally (candidate, count, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(candidate) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`
    ).run(candidate.trim(), count, new Date().toISOString());
    res.status(201).json({ candidate: candidate.trim(), count });
  });

  return router;
}