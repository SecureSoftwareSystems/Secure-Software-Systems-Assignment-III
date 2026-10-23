import { randomInt } from 'node:crypto';

export type RandomIntFn = (maxExclusive: number) => number;

const secureRandomInt: RandomIntFn = (maxExclusive) => randomInt(maxExclusive);

export function fisherYatesShuffle<T>(items: readonly T[], rand: RandomIntFn = secureRandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error('random source returned an out-of-range index');
    }
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export type AnonymousBallot = readonly string[];

export interface BallotRecord {
  preferences: readonly string[];
  [other: string]: unknown;
}

export function anonymise(records: readonly BallotRecord[]): AnonymousBallot[] {
  return records.map((r) => Object.freeze([...r.preferences]));
}

export function prepareForCounting(
  records: readonly BallotRecord[],
  rand: RandomIntFn = secureRandomInt,
): AnonymousBallot[] {
  return fisherYatesShuffle(anonymise(records), rand);
}
