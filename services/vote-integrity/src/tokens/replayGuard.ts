import { createHash } from 'node:crypto';
import { isUniqueViolation, withTransaction, type DB } from '../db';
import { BallotStore } from '../ballots';

export class ReplayError extends Error {
  constructor() {
    super('ballot token has already been used');
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function initConsumedTokens(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS consumed_tokens (
      token_hash TEXT PRIMARY KEY
    ) WITHOUT ROWID;
  `);
}

export class ReplayGuard {
  private readonly consumeStmt;
  private readonly isUsedStmt;

  constructor(private readonly db: DB, private readonly ballots: BallotStore) {
    initConsumedTokens(db);
    this.consumeStmt = db.prepare('INSERT INTO consumed_tokens (token_hash) VALUES (?)');
    this.isUsedStmt = db.prepare('SELECT 1 FROM consumed_tokens WHERE token_hash = ?');
  }

  accept(token: string, preferences: readonly string[]): void {
    try {
      const tokenHash = hashToken(token);
      withTransaction(this.db, () => {
        this.consumeStmt.run(tokenHash);
        this.ballots.add(preferences);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ReplayError();
      throw err;
    }
  }

  isConsumed(token: string): boolean {
    return this.isUsedStmt.get(hashToken(token)) !== undefined;
  }
}
