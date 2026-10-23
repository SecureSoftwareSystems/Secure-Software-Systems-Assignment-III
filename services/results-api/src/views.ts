import type { VerifiedResult } from './resultsSource';


export function publicView(v: VerifiedResult) {
  const last = v.result.rounds[v.result.rounds.length - 1];
  return {
    winner: v.result.winner,
    totalBallots: v.result.totalBallots,
    rounds: v.result.rounds.length,
    finalTallies: last ? last.tallies : {},
    resultHash: v.resultHash,
    countedAt: v.countedAt,
  };
}

export function fullView(v: VerifiedResult) {
  return {
    ...publicView(v),
    roundByRound: v.result.rounds,
    ballotSetHash: v.ballotSetHash,
  };
}
