import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * SR-20 — encryption at rest for personal data fields.
 *
 * AES-256-GCM (authenticated encryption) with:
 *   - a 256-bit key from DATA_ENCRYPTION_KEY, held in the secrets store (SR-16), never in code or the database;
 *   - a fresh random 96-bit IV for every encryption, so the same email encrypts differently each time;
 *   - the row id as additional authenticated data (AAD), so a ciphertext copied into another row won't decrypt;
 *   - the GCM tag checked on decrypt, so any change to the stored value is detected, not silently accepted.
 *
 * Stored format: "v1:" + base64(iv | tag | ciphertext). The version prefix allows key rotation later.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DecryptionError extends Error {
  constructor() {
    super('field could not be decrypted (wrong key, wrong record, or tampered data)');
  }
}

export function parseKey(hex: string | undefined): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (256 bits). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(hex, 'hex');
}

export class FieldCipher {
  private readonly key: Buffer;

  constructor(keyHex: string | undefined) {
    this.key = parseKey(keyHex);
  }

  encrypt(plaintext: string, aad: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
  }

  decrypt(stored: string, aad: string): string {
    const [version, payload] = stored.split(':');
    if (version !== VERSION || !payload) throw new DecryptionError();
    const raw = Buffer.from(payload, 'base64');
    if (raw.length < IV_BYTES + TAG_BYTES) throw new DecryptionError();
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ct = raw.subarray(IV_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new DecryptionError();
    }
  }
}
