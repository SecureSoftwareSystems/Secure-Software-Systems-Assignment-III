import { openTallyDb } from '../src/db/tallyDb';

const db = openTallyDb();
const upsert = db.prepare(
  `INSERT INTO tally (candidate, count, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(candidate) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`
);
for (const [name, count] of [['Candidate A', 120], ['Candidate B', 95]] as const) {
  upsert.run(name, count, new Date().toISOString());
}
console.log('Seeded demo tally rows');
db.close();