import fs from 'fs';
import path from 'path';
import { TallyDb } from './db/tallyDb';

export async function backupTally(db: TallyDb, backupDir: string = 'backups'): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `tally-${stamp}.db`);
  await db.backup(dest);
  return dest;
}