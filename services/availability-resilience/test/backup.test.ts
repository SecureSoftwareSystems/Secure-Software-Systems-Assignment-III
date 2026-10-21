import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { openTallyDb } from '../src/db/tallyDb';
import { backupTally } from '../src/backup';

describe('tally backup', () => {
  it('creates a timestamped, valid backup containing the data', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
    const db = openTallyDb(path.join(dir, 'tally.db'));
    db.prepare('INSERT INTO tally (candidate, count, updated_at) VALUES (?, ?, ?)')
      .run('Alice', 5, new Date().toISOString());

    const backupPath = await backupTally(db, path.join(dir, 'backups'));

    expect(fs.existsSync(backupPath)).toBe(true);
    expect(path.basename(backupPath)).toMatch(/^tally-\d{4}-\d{2}-\d{2}T.*\.db$/);

    const copy = new Database(backupPath, { fileMustExist: true });
    expect(copy.prepare('SELECT count FROM tally WHERE candidate = ?').get('Alice')).toEqual({ count: 5 });
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    copy.close();

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});