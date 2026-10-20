import type { AnonymousBallot } from '../shuffle/shuffle';

/**
 * SR-10 — shared specification for both counting engines.
 *
 * Instant-runoff (single seat, optional preferential), as in Australian
 * House of Representatives counts:
 *   R1. Each round, a ballot counts for its highest-ranked candidate still in
 *       the count. A ballot with no remaining candidate is "exhausted".
 *   R2. A candidate with MORE than half of the non-exhausted votes in a round wins.
 *   R3. If only one candidate is left, that candidate wins.
 *   R4. Otherwise the candidate with the fewest votes is excluded and the next round starts.
 *   R5. Ties for fewest votes are broken by countback: look at earlier rounds,
 *       most recent first, and exclude whichever tied candidate had fewer votes
 *       there. If they are tied in every round, exclude the one listed LAST in
 *       the candidate list (a deterministic stand-in for drawing lots, so both
 *       engines and any re-run always give the same answer).
 *
 * The two engines are written independently against this text only.
 * This file holds only the shared types and input checks; there is no
 * counting logic here that both engines could share a bug through.
 */

export interface RoundResult {
  round: number;
  /** votes per candidate still in the count at the start of this round */
  tallies: Record<string, number>;
  exhausted: number;
  /** candidate excluded at the end of this round, or null in the final round */
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
