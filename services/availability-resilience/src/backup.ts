import fs from 'fs';
import path from 'path';
import { TallyDb } from './db/tallyDb';

// Uses SQLite's online backup API (via better-sqlite3), which gives a consistent
// snapshot even while the database is in use. A plain file copy of a live
// WAL-mode database can produce an inconsistent backup.
export async function backupTally(db: TallyDb, backupDir: string = 'backups'): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `tally-${stamp}.db`);
  await db.backup(dest);
  return dest;
}