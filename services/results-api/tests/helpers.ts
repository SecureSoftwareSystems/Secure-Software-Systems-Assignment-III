import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp, type AppDeps } from '../src/app';
import { canonicalJson, type CountResult, type ResultsSource, type VerifiedResult } from '../src/resultsSource';
import type { Role } from '../src/auth';
import { openDatabase } from '../src/db';
import { FieldCipher } from '../src/crypto/fieldEncryption';
import { ApiClientStore } from '../src/clients';

export const DATA_KEY = 'a1'.repeat(32); // test-only 256-bit key

export function makeClients() {
  const db = openDatabase();
  return { db, store: new ApiClientStore(db, new FieldCipher(DATA_KEY)) };
}

export const JWT_KEY = 'test-only-jwt-signing-key-0123456789abcdef';
export const RELEASE_AT = new Date('2026-10-24T18:00:00+11:00');
export const BEFORE = new Date(RELEASE_AT.getTime() - 60_000);
export const AFTER = new Date(RELEASE_AT.getTime() + 60_000);

export function bearer(role: Role, key = JWT_KEY): string {
  // Shaped like auth-access-control's login tokens: numeric user id, role, username.
  const ids = { admin: 1, delegate: 2, auditor: 4 } as const;
  return `Bearer ${jwt.sign({ sub: ids[role], role, username: `${role}-1` }, key, { algorithm: 'HS256', expiresIn: '15m' })}`;
}

export function verified(): VerifiedResult {
  const result: CountResult = {
    winner: 'Knoxville',
    totalBallots: 100,
    rounds: [
      { round: 1, tallies: { Memphis: 42, Nashville: 26, Chattanooga: 15, Knoxville: 17 }, exhausted: 0, excluded: 'Chattanooga' },
      { round: 2, tallies: { Memphis: 42, Nashville: 26, Knoxville: 32 }, exhausted: 0, excluded: 'Nashville' },
      { round: 3, tallies: { Memphis: 42, Knoxville: 58 }, exhausted: 0, excluded: null },
    ],
  };
  return {
    result,
    resultHash: createHash('sha256').update(canonicalJson(result)).digest('hex'),
    ballotSetHash: 'b'.repeat(64),
    countedAt: '2026-10-24T08:00:00.000Z',
  };
}

export const sourceOf = (value: VerifiedResult | null): ResultsSource => ({ latest: async () => value });

export function makeApp(over: Partial<AppDeps> & { at?: Date } = {}) {
  const at = over.at ?? AFTER;
  return createApp({
    source: sourceOf(verified()),
    clients: makeClients().store,
    jwtSigningKey: JWT_KEY,
    releaseAt: RELEASE_AT,
    now: () => at,
    ...over,
  });
}
