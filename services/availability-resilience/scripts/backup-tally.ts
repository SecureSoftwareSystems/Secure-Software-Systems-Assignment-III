import { openTallyDb } from '../src/db/tallyDb';
import { backupTally } from '../src/backup';

(async () => {
  const db = openTallyDb();
  try {
    const dest = await backupTally(db);
    console.log(`Backup created: ${dest}`);
  } catch (err) {
    console.error('Backup failed:', err);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();