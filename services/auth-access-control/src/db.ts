import Database from "better-sqlite3";

export type Role = "admin" | "delegate" | "auditor"

export interface Users {
    id : number;
    username : string;
    password_hash : string;
    role : Role;
}

export interface ExclusionActions {
    id : number;
    candidate_id : string;
    reason : string;
    status : "pending" | "approved" | "rejected";
    maker_id : number;
    checker_id : number | null;
    created_at : string;
    decided_at : string | null;
}

// creates or opens the SQLite database and applies the schema
export function createDb(path: string = ":memory:"): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'delegate', 'auditor'))
    );

    CREATE TABLE IF NOT EXISTS exclusion_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      maker_id INTEGER NOT NULL REFERENCES users(id),
      checker_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      CHECK (
        (status = 'pending' AND checker_id IS NULL AND decided_at IS NULL)
        OR
        (status IN ('approved', 'rejected') AND checker_id IS NOT NULL AND decided_at IS NOT NULL)
      )
    );
  `);

  return db;
}
