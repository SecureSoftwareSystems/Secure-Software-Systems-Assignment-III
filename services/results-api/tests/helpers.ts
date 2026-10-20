import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp, type AppDeps } from '../src/app';
import { canonicalJson, type CountResult, type ResultsSource, type VerifiedResult } from '../src/resultsSource';
import type { Role } from '../src/auth';

export const JWT_KEY = 'test-only-jwt-signing-key-0123456789abcdef';
export const RELEASE_AT = new Date('2026-10-24T18:00:00+11:00');
export const BEFORE = new Date(RELEASE_AT.getTime() - 60_000);
export const AFTER = new Date(RELEASE_AT.getTime() + 60_000);

export function bearer(role: Role, key = JWT_KEY): string {
  return `Bearer ${jwt.sign({ sub: `${role}-1`, role }, key, { algorithm: 'HS256', expiresIn: '15m' })}`;
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
    jwtSigningKey: JWT_KEY,
    releaseAt: RELEASE_AT,
    now: () => at,
    ...over,
  });
}
