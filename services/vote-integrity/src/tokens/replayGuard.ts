import { createHash } from 'node:crypto';
import { isUniqueViolation, withTransaction, type DB } from '../db';
import { BallotStore } from '../ballots';

/**
 * SR-07 — Single-use ballot tokens (replay protection).
 *
 * Each ballot arrives with a one-time token issued by the voting client.
 * Accepting a ballot does two things in ONE database transaction:
 *   1. insert SHA-256(token) into consumed_tokens, whose PRIMARY KEY makes a
 *      second insert of the same token fail;
 *   2. store the ballot.
 * Either both happen or neither does, so:
 *   - a replayed token is rejected even if two copies arrive at the same moment
 *     (the database, not application code, enforces uniqueness);
 *   - a ballot that fails to store doesn't use up its token.
 *
 * Privacy: only the token's hash is stored, never the token itself, and no
 * timestamp is kept. consumed_tokens is WITHOUT ROWID, so its row order
 * doesn't record which token was used first. Nothing links a consumed token
 * to the ballot it came with.
 */

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

  /** Stores the ballot and burns its token, or throws ReplayError if the token was already used. */
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
