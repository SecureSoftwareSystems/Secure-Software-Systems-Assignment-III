import { openDatabase, type DB } from '../src/db';
import { AuditLog, GENESIS_HASH, computeEntryHash } from '../src/audit/auditLog';

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789';

function attackerDropsTriggers(db: DB): void {
  db.exec('DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_log_no_delete;');
}

function seed(log: AuditLog, n = 5): void {
  for (let i = 1; i <= n; i++) log.append('delegate-1', 'COUNT_ROUND', { round: i });
}

describe('SR-09 hash-chained audit log', () => {
  let db: DB;
  let log: AuditLog;

  beforeEach(() => {
    db = openDatabase();
    log = new AuditLog(db);
  });

  afterEach(() => db.close());

  test('entries are chained: each prev_hash is the previous entry hash, the first links to genesis', () => {
    seed(log, 3);
    const [a, b, c] = log.entries();
    expect(a!.prevHash).toBe(GENESIS_HASH);
    expect(b!.prevHash).toBe(a!.hash);
    expect(c!.prevHash).toBe(b!.hash);
    expect(log.verifyChain()).toEqual({ valid: true, checked: 3 });
  });

  test('an empty log verifies as valid', () => {
    expect(log.verifyChain()).toEqual({ valid: true, checked: 0 });
  });

  test('UPDATE on the audit log is rejected by the database (append-only)', () => {
    seed(log, 2);
    expect(() => db.prepare("UPDATE audit_log SET actor = 'mallory' WHERE seq = 1").run()).toThrow(/append-only/);
  });

  test('DELETE on the audit log is rejected by the database (append-only)', () => {
    seed(log, 2);
    expect(() => db.prepare('DELETE FROM audit_log WHERE seq = 2').run()).toThrow(/append-only/);
  });

  test('editing an entry\'s content breaks the chain at that entry', () => {
    seed(log, 5);
    attackerDropsTriggers(db);
    db.prepare(`UPDATE audit_log SET details = '{"round":99}' WHERE seq = 3`).run();

    const result = log.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSeq).toBe(3);
    expect(result.checked).toBe(2);
  });

  test('editing an entry and recomputing its hash still breaks the chain at the next entry', () => {
    seed(log, 5);
    attackerDropsTriggers(db);
    const e3 = log.entries()[2]!;
    const forged = { ...e3, details: '{"round":99}' };
    db.prepare('UPDATE audit_log SET details = ?, hash = ? WHERE seq = 3').run(forged.details, computeEntryHash(forged));

    const result = log.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSeq).toBe(4);
  });

  test('deleting an entry from the middle is detected', () => {
    seed(log, 5);
    attackerDropsTriggers(db);
    db.prepare('DELETE FROM audit_log WHERE seq = 2').run();

    const result = log.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSeq).toBe(3);
  });

  test('a signed checkpoint verifies against the untouched chain', () => {
    seed(log, 4);
    const cp = log.checkpoint(KEY);
    expect(cp.seq).toBe(4);
    expect(log.verifyCheckpoint(KEY, cp)).toBe(true);
    log.append('auditor-1', 'VIEW_LOG');
    expect(log.verifyCheckpoint(KEY, cp)).toBe(true);
  });

  test('rewriting the whole chain passes verifyChain() but is caught by the earlier checkpoint', () => {
    seed(log, 4);
    const cp = log.checkpoint(KEY);

    attackerDropsTriggers(db);
    const original = log.entries();
    db.prepare('DELETE FROM audit_log').run();
    let prev = GENESIS_HASH;
    for (const e of original) {
      const forged = { ...e, actor: 'mallory', prevHash: prev };
      const hash = computeEntryHash(forged);
      db.prepare('INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        forged.seq, forged.ts, forged.actor, forged.action, forged.details, prev, hash,
      );
      prev = hash;
    }

    expect(log.verifyChain().valid).toBe(true);
    expect(log.verifyCheckpoint(KEY, cp)).toBe(false);
  });

  test('a checkpoint signed with the wrong key is rejected', () => {
    seed(log, 2);
    const cp = log.checkpoint(KEY);
    expect(log.verifyCheckpoint('a-different-key-that-is-also-long-enough', cp)).toBe(false);
  });

  test('checkpoints refuse to run without a strong key (fail closed)', () => {
    expect(() => log.checkpoint('')).toThrow(/AUDIT_LOG_HMAC_KEY/);
    expect(() => log.checkpoint('short')).toThrow(/AUDIT_LOG_HMAC_KEY/);
  });

  test('details are stored as canonical JSON, so key order does not change the hash', () => {
    const a = log.append('x', 'A', { b: 1, a: 2 });
    expect(a.details).toBe('{"a":2,"b":1}');
  });
});
