import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type TallyDb = Database.Database;

// Tally data lives in its own SQLite file, separate from users/exclusions.
export function openTallyDb(
  dbPath: string = process.env.TALLY_DB_PATH ?? path.join('data', 'tally.db')
): TallyDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tally (
      candidate  TEXT PRIMARY KEY,
      count      INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}