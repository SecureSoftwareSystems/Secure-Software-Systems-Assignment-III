import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { withTransaction, type DB } from '../db';

/**
 * SR-09 — Hash-chained, append-only audit log.
 *
 * Every entry stores hash = SHA-256(previous entry's hash + this entry's content).
 * Changing, removing or reordering any entry breaks the chain from that entry on,
 * and verifyChain() reports where.
 *
 * Three layers of protection:
 *   1. SQLite triggers reject UPDATE and DELETE on audit_log (append-only).
 *   2. The hash chain makes any change that gets past the triggers detectable.
 *   3. A signed checkpoint (HMAC-SHA256 over the latest hash, keyed with
 *      AUDIT_LOG_HMAC_KEY from the secrets store, SR-16) is exported to the
 *      isolated store (SR-12). An attacker who rewrites the whole chain
 *      cannot forge a matching checkpoint without the key.
 */

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  details: string; // canonical JSON
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  /** seq of the first entry that fails verification, if any */
  firstInvalidSeq?: number;
  reason?: string;
}

export interface Checkpoint {
  seq: number;
  hash: string;
  signature: string;
}

export function initAuditLog(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      seq       INTEGER PRIMARY KEY,
      ts        TEXT NOT NULL,
      actor     TEXT NOT NULL,
      action    TEXT NOT NULL,
      details   TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash      TEXT NOT NULL UNIQUE
    );

    CREATE TRIGGER IF NOT EXISTS audit_log_no_update
    BEFORE UPDATE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
    BEFORE DELETE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only');
    END;
  `);
}

/** JSON with object keys sorted at every level, so the same data always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * The hashed content is a JSON array rather than a plain concatenation,
 * so field boundaries can't be shifted: ("ab","c") and ("a","bc") hash differently.
 */
export function computeEntryHash(e: Omit<AuditEntry, 'hash'>): string {
  const content = JSON.stringify([e.seq, e.ts, e.actor, e.action, e.details]);
  return createHash('sha256').update(e.prevHash).update(content).digest('hex');
}

type Row = {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  details: string;
  prev_hash: string;
  hash: string;
};

function fromRow(r: Row): AuditEntry {
  return {
    seq: r.seq,
    ts: r.ts,
    actor: r.actor,
    action: r.action,
    details: r.details,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}

export class AuditLog {
  private readonly insertStmt;
  private readonly lastStmt;
  private readonly allStmt;

  constructor(private readonly db: DB, private readonly now: () => Date = () => new Date()) {
    initAuditLog(db);
    this.insertStmt = db.prepare(
      `INSERT INTO audit_log (seq, ts, actor, action, details, prev_hash, hash)
       VALUES (@seq, @ts, @actor, @action, @details, @prevHash, @hash)`,
    );
    this.lastStmt = db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    this.allStmt = db.prepare('SELECT * FROM audit_log ORDER BY seq ASC');
  }

  append(actor: string, action: string, details: unknown = {}): AuditEntry {
    if (!actor || !action) throw new Error('actor and action are required');
    // Reading the last hash and inserting the new row happen in one transaction,
    // so two writers can never both chain onto the same previous entry.
    return withTransaction(this.db, () => {
      const last = this.lastStmt.get() as Row | undefined;
      const partial = {
        seq: last ? last.seq + 1 : 1,
        ts: this.now().toISOString(),
        actor,
        action,
        details: canonicalJson(details ?? {}),
        prevHash: last ? last.hash : GENESIS_HASH,
      };
      const entry: AuditEntry = { ...partial, hash: computeEntryHash(partial) };
      this.insertStmt.run(entry as unknown as Record<string, string | number>);
      return entry;
    });
  }

  entries(): AuditEntry[] {
    return (this.allStmt.all() as Row[]).map(fromRow);
  }

  head(): AuditEntry | undefined {
    const r = this.lastStmt.get() as Row | undefined;
    return r ? fromRow(r) : undefined;
  }

  /** Walks the whole chain from the genesis entry and recomputes every hash. */
  verifyChain(): ChainVerification {
    let expectedPrev = GENESIS_HASH;
    let expectedSeq = 1;
    let checked = 0;

    for (const e of this.entries()) {
      if (e.seq !== expectedSeq) {
        return { valid: false, checked, firstInvalidSeq: e.seq, reason: `gap in sequence: expected ${expectedSeq}` };
      }
      if (e.prevHash !== expectedPrev) {
        return { valid: false, checked, firstInvalidSeq: e.seq, reason: 'prev_hash does not match previous entry' };
      }
      if (computeEntryHash(e) !== e.hash) {
        return { valid: false, checked, firstInvalidSeq: e.seq, reason: 'entry content does not match its hash' };
      }
      expectedPrev = e.hash;
      expectedSeq += 1;
      checked += 1;
    }
    return { valid: true, checked };
  }

  /** Signs the current head of the chain, for export to the isolated store (SR-12). */
  checkpoint(key: string): Checkpoint {
    requireKey(key);
    const h = this.head();
    const seq = h ? h.seq : 0;
    const hash = h ? h.hash : GENESIS_HASH;
    return { seq, hash, signature: signCheckpoint(key, seq, hash) };
  }

  /**
   * Confirms that a previously exported checkpoint is still part of this chain.
   * Fails if the checkpoint was forged, or if the chain was rewritten after it was taken.
   */
  verifyCheckpoint(key: string, cp: Checkpoint): boolean {
    requireKey(key);
    if (!safeEqualHex(signCheckpoint(key, cp.seq, cp.hash), cp.signature)) return false;
    if (cp.seq === 0) return cp.hash === GENESIS_HASH;
    const row = this.db.prepare('SELECT hash FROM audit_log WHERE seq = ?').get(cp.seq) as { hash: string } | undefined;
    return row !== undefined && safeEqualHex(row.hash, cp.hash);
  }
}

function requireKey(key: string): void {
  if (!key || key.length < 32) {
    throw new Error('AUDIT_LOG_HMAC_KEY must be set and at least 32 characters');
  }
}

function signCheckpoint(key: string, seq: number, hash: string): string {
  return createHmac('sha256', key).update(`${seq}:${hash}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
