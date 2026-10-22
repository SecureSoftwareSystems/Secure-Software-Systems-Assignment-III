import type { DB } from './db';

export type ContestStatus = 'setup' | 'open' | 'closed';

export interface Contest {
  candidates: string[];
  status: ContestStatus;
}

export function initContest(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contest (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      candidates TEXT NOT NULL,
      status     TEXT NOT NULL CHECK (status IN ('setup', 'open', 'closed'))
    );
    INSERT OR IGNORE INTO contest (id, candidates, status) VALUES (1, '[]', 'setup');
  `);
}

export class ContestError extends Error {}

export class ContestStore {
  constructor(private readonly db: DB) {
    initContest(db);
  }

  get(): Contest {
    const row = this.db.prepare('SELECT candidates, status FROM contest WHERE id = 1').get() as {
      candidates: string;
      status: ContestStatus;
    };
    return { candidates: JSON.parse(row.candidates) as string[], status: row.status };
  }

  open(candidates: string[]): Contest {
    if (this.get().status !== 'setup') throw new ContestError('contest has already been opened');
    this.db.prepare("UPDATE contest SET candidates = ?, status = 'open' WHERE id = 1").run(JSON.stringify(candidates));
    return this.get();
  }

  close(): Contest {
    if (this.get().status !== 'open') throw new ContestError('only an open contest can be closed');
    this.db.prepare("UPDATE contest SET status = 'closed' WHERE id = 1").run();
    return this.get();
  }
}
