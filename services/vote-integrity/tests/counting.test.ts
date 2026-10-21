import { countIrvEngineA } from '../src/counting/irvEngineA';
import { countIrvEngineB } from '../src/counting/irvEngineB';
import { compareResults, hashBallotSet, verifiedCount } from '../src/counting/comparator';
import { CountInputError, type CountingEngine } from '../src/counting/types';

const repeat = (prefs: string[], n: number) => Array.from({ length: n }, () => prefs);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENGINES: [string, CountingEngine][] = [
  ['Engine A', countIrvEngineA],
  ['Engine B', countIrvEngineB],
];

describe.each(ENGINES)('SR-10 %s against known results', (_name, count) => {
  test('textbook example (Tennessee capital): Knoxville wins in round 3', () => {
    const candidates = ['Memphis', 'Nashville', 'Chattanooga', 'Knoxville'];
    const ballots = [
      ...repeat(['Memphis', 'Nashville', 'Chattanooga', 'Knoxville'], 42),
      ...repeat(['Nashville', 'Chattanooga', 'Knoxville', 'Memphis'], 26),
      ...repeat(['Chattanooga', 'Knoxville', 'Nashville', 'Memphis'], 15),
      ...repeat(['Knoxville', 'Chattanooga', 'Nashville', 'Memphis'], 17),
    ];
    const r = count(candidates, ballots);
    expect(r.winner).toBe('Knoxville');
    expect(r.rounds.map((x) => x.excluded)).toEqual(['Chattanooga', 'Nashville', null]);
    expect(r.rounds[0]!.tallies).toEqual({ Memphis: 42, Nashville: 26, Chattanooga: 15, Knoxville: 17 });
    expect(r.rounds[1]!.tallies).toEqual({ Memphis: 42, Nashville: 26, Knoxville: 32 });
    expect(r.rounds[2]!.tallies).toEqual({ Memphis: 42, Knoxville: 58 });
  });

  test('a first-round majority wins straight away', () => {
    const r = count(['A', 'B', 'C'], [...repeat(['A'], 6), ...repeat(['B'], 3), ...repeat(['C'], 2)]);
    expect(r.winner).toBe('A');
    expect(r.rounds).toHaveLength(1);
  });

  test('exhausted ballots drop out of the majority calculation', () => {
    const r = count(['A', 'B', 'C'], [...repeat(['A'], 4), ...repeat(['B'], 3), ...repeat(['C'], 2)]);
    expect(r.winner).toBe('A');
    expect(r.rounds[1]!.exhausted).toBe(2);
  });

  test('ties are broken by countback to an earlier round', () => {
    const r = count(['A', 'C', 'B', 'D'], [
      ...repeat(['A'], 6),
      ...repeat(['B'], 5),
      ...repeat(['C'], 4),
      ['D', 'C'],
      ['D'],
    ]);
    expect(r.rounds.map((x) => x.excluded)).toEqual(['D', 'C', null]);
    expect(r.winner).toBe('A');
  });

  test('a tie in every round excludes the candidate listed last', () => {
    const r = count(['A', 'B', 'C', 'D'], [...repeat(['A'], 5), ...repeat(['B'], 4), ...repeat(['C'], 3), ...repeat(['D'], 3)]);
    expect(r.rounds[0]!.excluded).toBe('D');
  });

  test('a single candidate wins even with every ballot exhausted around them', () => {
    const r = count(['Solo'], [['Solo']]);
    expect(r).toMatchObject({ winner: 'Solo', totalBallots: 1 });
  });

  test('rejects unknown candidates, duplicate rankings and empty input', () => {
    expect(() => count(['A', 'B'], [['A', 'Z']])).toThrow(CountInputError);
    expect(() => count(['A', 'B'], [['A', 'A']])).toThrow(CountInputError);
    expect(() => count(['A', 'B'], [])).toThrow(CountInputError);
  });
});

describe('SR-10 the two engines agree', () => {
  test('on 400 random elections (3-8 candidates, 1-300 ballots, partial rankings)', () => {
    const rand = mulberry32(20261020);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

    for (let e = 0; e < 400; e++) {
      const candidates = Array.from({ length: int(3, 8) }, (_, i) => `C${i}`);
      const ballots = Array.from({ length: int(1, 300) }, () => {
        const order = [...candidates];
        for (let i = order.length - 1; i > 0; i--) {
          const j = int(0, i);
          [order[i], order[j]] = [order[j]!, order[i]!];
        }
        return order.slice(0, int(1, order.length));
      });
      const cmp = compareResults(countIrvEngineA(candidates, ballots), countIrvEngineB(candidates, ballots));
      if (!cmp.match) throw new Error(`election ${e} differs: ${cmp.discrepancies.join('; ')}`);
    }
  });

  test('the result does not depend on ballot order (so the SR-03 shuffle cannot change it)', () => {
    const candidates = ['A', 'B', 'C', 'D'];
    const ballots = [...repeat(['A', 'B'], 7), ...repeat(['B', 'C'], 6), ...repeat(['C', 'A'], 5), ...repeat(['D', 'C'], 3)];
    const forward = countIrvEngineA(candidates, ballots);
    const backward = countIrvEngineA(candidates, [...ballots].reverse());
    expect(compareResults(forward, backward).match).toBe(true);
  });
});

describe('SR-10 comparator', () => {
  const candidates = ['A', 'B', 'C'];
  const ballots = [...repeat(['A'], 4), ...repeat(['B', 'A'], 3), ...repeat(['C', 'B'], 2)];

  test('identical results match and are released with a hash', () => {
    const out = verifiedCount(candidates, ballots);
    expect(out.status).toBe('VERIFIED');
    if (out.status === 'VERIFIED') expect(out.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('catches an engine that reports a different winner', () => {
    const rigged: CountingEngine = (c, b) => ({ ...countIrvEngineA(c, b), winner: 'C' });
    const out = verifiedCount(candidates, ballots, countIrvEngineA, rigged);
    expect(out.status).toBe('MISMATCH');
    if (out.status === 'MISMATCH') expect(out.discrepancies).toContain('winner: A=B B=C');
  });

  test('catches a single vote moved in one round, even when the winner is the same', () => {
    const skewed: CountingEngine = (c, b) => {
      const r = countIrvEngineB(c, b);
      const t = r.rounds[0]!.tallies;
      return { ...r, rounds: [{ ...r.rounds[0]!, tallies: { ...t, A: t.A! + 1, B: t.B! - 1 } }, ...r.rounds.slice(1)] };
    };
    const out = verifiedCount(candidates, ballots, countIrvEngineA, skewed);
    expect(out.status).toBe('MISMATCH');
    if (out.status === 'MISMATCH') {
      expect(out.discrepancies).toEqual(expect.arrayContaining(['round 1 tally A: A=4 B=5', 'round 1 tally B: A=3 B=2']));
    }
  });

  test('an engine that crashes halts the count instead of trusting the other engine', () => {
    const broken: CountingEngine = () => {
      throw new Error('index out of bounds');
    };
    const out = verifiedCount(candidates, ballots, countIrvEngineA, broken);
    expect(out).toEqual({ status: 'MISMATCH', discrepancies: ['engine B failed: index out of bounds'] });
  });

  test('bad input is reported as an input error, not a mismatch', () => {
    expect(() => verifiedCount(candidates, [['Z']])).toThrow(CountInputError);
  });

  test('ballot-set hash is the same whatever order the ballots are in', () => {
    expect(hashBallotSet(ballots)).toBe(hashBallotSet([...ballots].reverse()));
    expect(hashBallotSet(ballots)).not.toBe(hashBallotSet(ballots.slice(1)));
  });
});
