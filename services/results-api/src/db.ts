import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

/**
 * Opens the service's SQLite database with safe defaults.
 *
 * Uses Node's built-in SQLite (node:sqlite, Node 22.13+), so there is no
 * native add-on to compile on install and one fewer third-party dependency
 * in the supply chain (SR-06).
 *
 * Every module creates its own tables through its own init function, so
 * each requirement's schema lives next to the code that relies on it.
 * All queries use prepared statements with bound parameters. SQL is never
 * built by joining strings with input.
 */
export function openDatabase(path = ':memory:'): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

/**
 * Runs `fn` inside BEGIN IMMEDIATE ... COMMIT. IMMEDIATE takes the write lock
 * up front, so a read-then-write inside `fn` can't interleave with another
 * writer. Any error rolls the whole transaction back.
 */
export function withTransaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** True if a node:sqlite error is a UNIQUE or PRIMARY KEY constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { errcode?: number } | null;
  // 2067 = SQLITE_CONSTRAINT_UNIQUE, 1555 = SQLITE_CONSTRAINT_PRIMARYKEY
  return e?.errcode === 2067 || e?.errcode === 1555;
}
