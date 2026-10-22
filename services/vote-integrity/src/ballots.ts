import { randomUUID } from 'node:crypto';
import type { DB } from './db';
import { prepareForCounting, type AnonymousBallot, type RandomIntFn } from './shuffle/shuffle';

// SR-03: no timestamp, voter or IP column and WITHOUT ROWID, so arrival order is not stored.
export function initBallots(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ballots (
      id          TEXT PRIMARY KEY,
      preferences TEXT NOT NULL
    ) WITHOUT ROWID;
  `);
}

export class BallotStore {
  private readonly insertStmt;
  private readonly allStmt;
  private readonly countStmt;

  constructor(db: DB) {
    initBallots(db);
    this.insertStmt = db.prepare('INSERT INTO ballots (id, preferences) VALUES (?, ?)');
    this.allStmt = db.prepare('SELECT preferences FROM ballots');
    this.countStmt = db.prepare('SELECT COUNT(*) AS n FROM ballots');
  }

  add(preferences: readonly string[]): void {
    this.insertStmt.run(randomUUID(), JSON.stringify(preferences));
  }

  count(): number {
    return (this.countStmt.get() as { n: number }).n;
  }

  batchForCounting(rand?: RandomIntFn): AnonymousBallot[] {
    const rows = this.allStmt.all() as { preferences: string }[];
    const records = rows.map((r) => ({ preferences: JSON.parse(r.preferences) as string[] }));
    return prepareForCounting(records, rand);
  }
}
