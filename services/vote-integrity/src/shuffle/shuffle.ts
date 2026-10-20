import { randomInt } from 'node:crypto';

/**
 * SR-03 — Ballot anonymisation before counting.
 *
 * Two steps, always in this order:
 *   1. anonymise: keep only the preference list. Every other field (storage id,
 *      token, arrival time, source address) is dropped, so nothing that came in
 *      with the ballot reaches the counting engines.
 *   2. shuffle: Fisher-Yates with a cryptographically secure random source
 *      (crypto.randomInt), so the order ballots arrived in can't be used to
 *      match a ballot to the voter who cast it at a given time.
 *
 * Math.random() is deliberately not used: it's predictable, and the team's
 * Semgrep rules (semgrep-rules/rules.yaml, no-insecure-random) block it in CI.
 *
 * Scope note: this is a single trusted shuffle, not a verifiable re-encryption
 * mixnet (see report, Part Two, SR-03 option B).
 */

/** Returns an integer in [0, maxExclusive). Injectable so tests can make it deterministic. */
export type RandomIntFn = (maxExclusive: number) => number;

const secureRandomInt: RandomIntFn = (maxExclusive) => randomInt(maxExclusive);

/**
 * Unbiased Fisher-Yates (Durstenfeld) shuffle. Returns a new array; the input is not modified.
 * Each of the n! orderings is equally likely when `rand` is uniform.
 */
export function fisherYatesShuffle<T>(items: readonly T[], rand: RandomIntFn = secureRandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1); // 0 <= j <= i
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error('random source returned an out-of-range index');
    }
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** What the counting engines receive: preferences only, in rank order. */
export type AnonymousBallot = readonly string[];

/** Any stored or incoming ballot record. Only `preferences` survives anonymisation. */
export interface BallotRecord {
  preferences: readonly string[];
  [other: string]: unknown;
}

export function anonymise(records: readonly BallotRecord[]): AnonymousBallot[] {
  // Copy each preference list so later code can't reach back into the stored record.
  return records.map((r) => Object.freeze([...r.preferences]));
}

/** The only way ballots should reach the counting engines: anonymise, then shuffle. */
export function prepareForCounting(
  records: readonly BallotRecord[],
  rand: RandomIntFn = secureRandomInt,
): AnonymousBallot[] {
  return fisherYatesShuffle(anonymise(records), rand);
}
