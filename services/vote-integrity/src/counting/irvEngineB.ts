import type { AnonymousBallot } from '../shuffle/shuffle';
import { validateCountInput, type CountResult, type RoundResult } from './types';

/**
 * SR-10 Engine B — "ballot piles with transfers", the way a manual count works.
 *
 * Ballots are sorted once into a pile per candidate. When a candidate is
 * excluded, only the ballots in that pile are moved, each to its next
 * candidate still in the count (or set aside as exhausted). Tallies are
 * the pile sizes. Works with candidate index numbers, not names, and keeps
 * its own history for countback.
 *
 * Written separately from Engine A on purpose (different algorithm, data
 * structures and tie-break code), so a bug or a tampered line in one engine
 * makes the two disagree instead of failing silently in both.
 */
export function countIrvEngineB(candidates: readonly string[], ballots: readonly AnonymousBallot[]): CountResult {
  validateCountInput(candidates, ballots);

  const n = candidates.length;
  const indexOf = new Map(candidates.map((name, i) => [name, i] as const));
  const ranked: number[][] = ballots.map((b) => b.map((name) => indexOf.get(name)!));
  const position = new Array<number>(ranked.length).fill(0); // which preference each ballot is sitting on
  const inCount = new Array<boolean>(n).fill(true);
  const piles: number[][] = Array.from({ length: n }, () => []);
  const history: number[][] = []; // history[round][candidateIndex] = votes
  let exhausted = 0;
  let remaining = n;

  const place = (ballotIdx: number): void => {
    const prefs = ranked[ballotIdx]!;
    let p = position[ballotIdx]!;
    while (p < prefs.length && !inCount[prefs[p]!]) p++;
    position[ballotIdx] = p;
    if (p < prefs.length) piles[prefs[p]!]!.push(ballotIdx);
    else exhausted += 1;
  };

  for (let i = 0; i < ranked.length; i++) place(i);

  const rounds: RoundResult[] = [];
  let roundNo = 0;

  while (true) {
    roundNo += 1;
    const sizes = piles.map((pile, c) => (inCount[c] ? pile.length : -1));
    history.push(sizes);

    const tallies: Record<string, number> = {};
    for (let c = 0; c < n; c++) if (inCount[c]) tallies[candidates[c]!] = sizes[c]!;

    const liveVotes = ranked.length - exhausted;
    let majority = -1;
    for (let c = 0; c < n; c++) {
      if (inCount[c] && sizes[c]! > liveVotes / 2) majority = c;
    }

    if (majority >= 0 || remaining === 1) {
      const winnerIdx = majority >= 0 ? majority : inCount.indexOf(true);
      rounds.push({ round: roundNo, tallies, exhausted, excluded: null });
      return { winner: candidates[winnerIdx]!, rounds, totalBallots: ranked.length };
    }

    const out = chooseExcluded(sizes, inCount, history);
    rounds.push({ round: roundNo, tallies, exhausted, excluded: candidates[out]! });

    inCount[out] = false;
    remaining -= 1;
    const moving = piles[out]!;
    piles[out] = [];
    for (const ballotIdx of moving) place(ballotIdx);
  }
}

function chooseExcluded(sizes: readonly number[], inCount: readonly boolean[], history: readonly number[][]): number {
  let fewest = Infinity;
  for (let c = 0; c < sizes.length; c++) if (inCount[c] && sizes[c]! < fewest) fewest = sizes[c]!;

  let tied: number[] = [];
  for (let c = 0; c < sizes.length; c++) if (inCount[c] && sizes[c] === fewest) tied.push(c);

  // Countback through previous rounds, newest first (the last history entry is the current round).
  let r = history.length - 2;
  while (tied.length > 1 && r >= 0) {
    const row = history[r]!;
    const low = tied.reduce((m, c) => Math.min(m, row[c]!), Infinity);
    tied = tied.filter((c) => row[c] === low);
    r -= 1;
  }

  // Highest index = listed last on the candidate list.
  return tied.reduce((a, b) => Math.max(a, b));
}
