import type { DB } from '../db';
import type { CountResult } from './types';

export interface StoredResult {
  id: number;
  result: CountResult;
  resultHash: string;
  ballotSetHash: string;
  countedAt: string;
}

export class ResultStore {
  private readonly insertStmt;
  private readonly latestStmt;

  constructor(db: DB) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS count_results (
        id              INTEGER PRIMARY KEY,
        result          TEXT NOT NULL,
        result_hash     TEXT NOT NULL,
        ballot_set_hash TEXT NOT NULL,
        counted_at      TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS count_results_no_update
      BEFORE UPDATE ON count_results BEGIN SELECT RAISE(ABORT, 'count_results is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS count_results_no_delete
      BEFORE DELETE ON count_results BEGIN SELECT RAISE(ABORT, 'count_results is append-only'); END;
    `);
    this.insertStmt = db.prepare(
      'INSERT INTO count_results (result, result_hash, ballot_set_hash, counted_at) VALUES (?, ?, ?, ?)',
    );
    this.latestStmt = db.prepare('SELECT * FROM count_results ORDER BY id DESC LIMIT 1');
  }

  save(result: CountResult, resultHash: string, ballotSetHash: string): void {
    this.insertStmt.run(JSON.stringify(result), resultHash, ballotSetHash, new Date().toISOString());
  }

  latest(): StoredResult | undefined {
    const r = this.latestStmt.get() as
      | { id: number; result: string; result_hash: string; ballot_set_hash: string; counted_at: string }
      | undefined;
    if (!r) return undefined;
    return {
      id: r.id,
      result: JSON.parse(r.result) as CountResult,
      resultHash: r.result_hash,
      ballotSetHash: r.ballot_set_hash,
      countedAt: r.counted_at,
    };
  }
}
