import type { AnonymousBallot } from '../shuffle/shuffle';
import { validateCountInput, type CountResult, type RoundResult } from './types';

/**
 * SR-10 Engine A — "recount from scratch".
 *
 * Every round re-reads every ballot from the top and gives it to its first
 * candidate still in the count. Simple and easy to check by hand; does
 * O(rounds × ballots × preferences) work. Works with candidate names directly.
 */
export function countIrvEngineA(candidates: readonly string[], ballots: readonly AnonymousBallot[]): CountResult {
  validateCountInput(candidates, ballots);

  const continuing = new Set(candidates);
  const rounds: RoundResult[] = [];

  for (let roundNo = 1; ; roundNo++) {
    const tallies: Record<string, number> = {};
    for (const c of candidates) if (continuing.has(c)) tallies[c] = 0;

    let exhausted = 0;
    for (const ballot of ballots) {
      const choice = ballot.find((c) => continuing.has(c));
      if (choice === undefined) exhausted++;
      else tallies[choice] = (tallies[choice] ?? 0) + 1;
    }

    const live = ballots.length - exhausted;
    const leader = Object.keys(tallies).find((c) => (tallies[c] ?? 0) * 2 > live);

    if (leader !== undefined || continuing.size === 1) {
      const winner = leader ?? [...continuing][0]!;
      rounds.push({ round: roundNo, tallies, exhausted, excluded: null });
      return { winner, rounds, totalBallots: ballots.length };
    }

    const excluded = pickExclusion(candidates, tallies, rounds);
    rounds.push({ round: roundNo, tallies, exhausted, excluded });
    continuing.delete(excluded);
  }
}

/** Rule R4/R5: fewest votes; ties broken by countback, then last on the candidate list. */
function pickExclusion(
  candidates: readonly string[],
  current: Record<string, number>,
  earlier: readonly RoundResult[],
): string {
  const lowest = Math.min(...Object.values(current));
  let tied = Object.keys(current).filter((c) => current[c] === lowest);

  for (let r = earlier.length - 1; r >= 0 && tied.length > 1; r--) {
    const past = earlier[r]!.tallies;
    const min = Math.min(...tied.map((c) => past[c] ?? 0));
    tied = tied.filter((c) => (past[c] ?? 0) === min);
  }

  if (tied.length === 1) return tied[0]!;
  // Still tied everywhere: exclude the one listed last on the ballot paper.
  return [...tied].sort((x, y) => candidates.indexOf(y) - candidates.indexOf(x))[0]!;
}
