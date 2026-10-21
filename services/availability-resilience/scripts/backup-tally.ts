import { openTallyDb } from '../src/db/tallyDb';
import { backupTally } from '../src/backup';
import { logEvent } from '../src/logging/logger';

(async () => {
  const db = openTallyDb();
    try {
    const dest = await backupTally(db);
    logEvent({ event: 'backup_created', outcome: 'success', details: { file: dest } });
    console.log(`Backup created: ${dest}`);
  } catch (err) {
    logEvent({ level: 'ERROR', event: 'backup_failed', outcome: 'failure', details: { message: String(err) } });
    console.error('Backup failed:', err);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();