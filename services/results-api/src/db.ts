import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

export function openDatabase(path = ':memory:'): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  return db;
}


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

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { errcode?: number } | null;
  return e?.errcode === 2067 || e?.errcode === 1555;
}
