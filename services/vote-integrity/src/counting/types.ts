import type { AnonymousBallot } from '../shuffle/shuffle';

export interface RoundResult {
  round: number;
  tallies: Record<string, number>;
  exhausted: number;
  excluded: string | null;
}

export interface CountResult {
  winner: string;
  rounds: RoundResult[];
  totalBallots: number;
}

export type CountingEngine = (candidates: readonly string[], ballots: readonly AnonymousBallot[]) => CountResult;

export class CountInputError extends Error {}

export function validateCountInput(candidates: readonly string[], ballots: readonly AnonymousBallot[]): void {
  if (candidates.length < 1) throw new CountInputError('no candidates');
  if (new Set(candidates).size !== candidates.length) throw new CountInputError('duplicate candidate names');
  if (ballots.length === 0) throw new CountInputError('no ballots to count');
  const known = new Set(candidates);
  ballots.forEach((b, i) => {
    if (new Set(b).size !== b.length) throw new CountInputError(`ballot ${i} ranks a candidate twice`);
    for (const c of b) if (!known.has(c)) throw new CountInputError(`ballot ${i} ranks an unknown candidate`);
  });
}
