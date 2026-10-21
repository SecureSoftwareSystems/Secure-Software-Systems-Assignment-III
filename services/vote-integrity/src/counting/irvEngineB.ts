import type { AnonymousBallot } from '../shuffle/shuffle';
import { validateCountInput, type CountResult, type RoundResult } from './types';

export function countIrvEngineB(candidates: readonly string[], ballots: readonly AnonymousBallot[]): CountResult {
  validateCountInput(candidates, ballots);

  const n = candidates.length;
  const indexOf = new Map(candidates.map((name, i) => [name, i] as const));
  const ranked: number[][] = ballots.map((b) => b.map((name) => indexOf.get(name)!));
  const position = new Array<number>(ranked.length).fill(0);
  const inCount = new Array<boolean>(n).fill(true);
  const piles: number[][] = Array.from({ length: n }, () => []);
  const history: number[][] = [];
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

  let r = history.length - 2;
  while (tied.length > 1 && r >= 0) {
    const row = history[r]!;
    const low = tied.reduce((m, c) => Math.min(m, row[c]!), Infinity);
    tied = tied.filter((c) => row[c] === low);
    r -= 1;
  }

  return tied.reduce((a, b) => Math.max(a, b));
}
