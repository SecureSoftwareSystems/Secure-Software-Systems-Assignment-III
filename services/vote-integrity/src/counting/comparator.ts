import { createHash } from 'node:crypto';
import { canonicalJson } from '../audit/auditLog';
import type { AnonymousBallot } from '../shuffle/shuffle';
import { countIrvEngineA } from './irvEngineA';
import { countIrvEngineB } from './irvEngineB';
import { CountInputError, type CountingEngine, type CountResult } from './types';


export interface Comparison {
  match: boolean;
  discrepancies: string[];
}

export function compareResults(a: CountResult, b: CountResult): Comparison {
  const d: string[] = [];
  if (a.winner !== b.winner) d.push(`winner: A=${a.winner} B=${b.winner}`);
  if (a.totalBallots !== b.totalBallots) d.push(`totalBallots: A=${a.totalBallots} B=${b.totalBallots}`);
  if (a.rounds.length !== b.rounds.length) d.push(`rounds: A=${a.rounds.length} B=${b.rounds.length}`);

  const shared = Math.min(a.rounds.length, b.rounds.length);
  for (let i = 0; i < shared; i++) {
    const ra = a.rounds[i]!;
    const rb = b.rounds[i]!;
    const label = `round ${i + 1}`;
    if (ra.excluded !== rb.excluded) d.push(`${label} excluded: A=${ra.excluded} B=${rb.excluded}`);
    if (ra.exhausted !== rb.exhausted) d.push(`${label} exhausted: A=${ra.exhausted} B=${rb.exhausted}`);
    const names = new Set([...Object.keys(ra.tallies), ...Object.keys(rb.tallies)]);
    for (const c of names) {
      if (ra.tallies[c] !== rb.tallies[c]) d.push(`${label} tally ${c}: A=${ra.tallies[c]} B=${rb.tallies[c]}`);
    }
  }
  return { match: d.length === 0, discrepancies: d };
}

export function hashResult(result: CountResult): string {
  return createHash('sha256').update(canonicalJson(result)).digest('hex');
}

export function hashBallotSet(ballots: readonly AnonymousBallot[]): string {
  const lines = ballots.map((b) => JSON.stringify(b)).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export type VerifiedCount =
  | { status: 'VERIFIED'; result: CountResult; resultHash: string }
  | { status: 'MISMATCH'; discrepancies: string[] };

export function verifiedCount(
  candidates: readonly string[],
  ballots: readonly AnonymousBallot[],
  engineA: CountingEngine = countIrvEngineA,
  engineB: CountingEngine = countIrvEngineB,
): VerifiedCount {
  const a = runEngine('A', engineA, candidates, ballots);
  const b = runEngine('B', engineB, candidates, ballots);

  if (a.error instanceof CountInputError && b.error instanceof CountInputError) throw a.error;
  if (a.error || b.error) {
    return {
      status: 'MISMATCH',
      discrepancies: [a, b].filter((r) => r.error).map((r) => `engine ${r.name} failed: ${r.error!.message}`),
    };
  }

  const cmp = compareResults(a.result!, b.result!);
  if (!cmp.match) return { status: 'MISMATCH', discrepancies: cmp.discrepancies };
  return { status: 'VERIFIED', result: a.result!, resultHash: hashResult(a.result!) };
}

function runEngine(
  name: string,
  engine: CountingEngine,
  candidates: readonly string[],
  ballots: readonly AnonymousBallot[],
): { name: string; result?: CountResult; error?: Error } {
  try {
    return { name, result: engine(candidates, ballots) };
  } catch (err) {
    return { name, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
