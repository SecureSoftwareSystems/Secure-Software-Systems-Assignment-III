import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DB } from './db';
import type { FieldCipher } from './crypto/fieldEncryption';


export interface NewClient {
  name: string;
  organisation: string;
  contactEmail: string;
}

export interface ApiClient {
  id: string;
  name: string;
  organisation: string;
  contactEmail: string;
  createdAt: string;
  revokedAt: string | null;
}

type Row = {
  id: string;
  name: string;
  organisation: string;
  contact_email_enc: string;
  created_at: string;
  revoked_at: string | null;
};

export const hashApiKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');

export function initClients(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_clients (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      organisation      TEXT NOT NULL,
      contact_email_enc TEXT NOT NULL,
      key_hash          TEXT NOT NULL UNIQUE,
      created_at        TEXT NOT NULL,
      revoked_at        TEXT
    );
  `);
}

export class ApiClientStore {
  constructor(private readonly db: DB, private readonly cipher: FieldCipher) {
    initClients(db);
  }

  create(c: NewClient): { id: string; apiKey: string } {
    const id = randomUUID();
    const apiKey = `rk_${randomBytes(32).toString('base64url')}`; 
    this.db
      .prepare(
        'INSERT INTO api_clients (id, name, organisation, contact_email_enc, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, c.name, c.organisation, this.cipher.encrypt(c.contactEmail, id), hashApiKey(apiKey), new Date().toISOString());
    return { id, apiKey };
  }

  findByKey(apiKey: string): { id: string; name: string } | undefined {
    const row = this.db
      .prepare('SELECT id, name FROM api_clients WHERE key_hash = ? AND revoked_at IS NULL')
      .get(hashApiKey(apiKey)) as { id: string; name: string } | undefined;
    return row ? { id: row.id, name: row.name } : undefined;
  }

  list(): ApiClient[] {
    const rows = this.db.prepare('SELECT * FROM api_clients ORDER BY created_at').all() as Row[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      organisation: r.organisation,
      contactEmail: this.cipher.decrypt(r.contact_email_enc, r.id),
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    }));
  }

  revoke(id: string): boolean {
    const res = this.db
      .prepare('UPDATE api_clients SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), id);
    return Number(res.changes) > 0;
  }
}
