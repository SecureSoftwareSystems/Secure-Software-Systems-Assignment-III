import { anonymise, fisherYatesShuffle, prepareForCounting } from '../src/shuffle/shuffle';
import { BallotStore } from '../src/ballots';
import { openDatabase } from '../src/db';

const sorted = (xs: readonly (readonly string[])[]) => xs.map((x) => x.join('>')).sort();

describe('SR-03 Fisher-Yates shuffle', () => {
  const items = Array.from({ length: 50 }, (_, i) => `ballot-${i}`);

  test('output contains exactly the same items as the input', () => {
    const out = fisherYatesShuffle(items);
    expect(out).toHaveLength(items.length);
    expect([...out].sort()).toEqual([...items].sort());
  });

  test('output is in a different order from the input', () => {
    expect(fisherYatesShuffle(items)).not.toEqual(items);
  });

  test('does not modify the input array', () => {
    const copy = [...items];
    fisherYatesShuffle(items);
    expect(items).toEqual(copy);
  });

  test('follows the Fisher-Yates swap sequence for a given random source', () => {
    expect(fisherYatesShuffle(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a']);
  });

  test('rejects a random source that returns an out-of-range index', () => {
    expect(() => fisherYatesShuffle(['a', 'b', 'c'], (max) => max)).toThrow(/out-of-range/);
  });

  test('every ordering is about equally likely (chi-square, 6 orderings, 12,000 runs)', () => {
    const runs = 12000;
    const counts = new Map<string, number>();
    for (let i = 0; i < runs; i++) {
      const key = fisherYatesShuffle(['a', 'b', 'c']).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    const expected = runs / 6;
    let chiSquare = 0;
    for (const c of counts.values()) chiSquare += (c - expected) ** 2 / expected;
    expect(chiSquare).toBeLessThan(20.52);
  });

  test('handles empty and single-item lists', () => {
    expect(fisherYatesShuffle([])).toEqual([]);
    expect(fisherYatesShuffle(['only'])).toEqual(['only']);
  });
});

describe('SR-03 anonymisation', () => {
  const records = [
    { id: 'row-1', token: 'tok-abc', receivedAt: '2026-10-20T09:00:00Z', ip: '10.0.0.7', preferences: ['A', 'B'] },
    { id: 'row-2', token: 'tok-def', receivedAt: '2026-10-20T09:00:05Z', ip: '10.0.0.8', preferences: ['B'] },
  ];

  test('removes every field except the preferences', () => {
    const out = anonymise(records);
    expect(out).toEqual([['A', 'B'], ['B']]);
    const serialised = JSON.stringify(out);
    for (const leaked of ['row-1', 'tok-abc', '2026-10-20', '10.0.0.7']) {
      expect(serialised).not.toContain(leaked);
    }
  });

  test('anonymised ballots are copies, frozen against later changes', () => {
    const out = anonymise(records);
    expect(Object.isFrozen(out[0])).toBe(true);
    expect(out[0]).not.toBe(records[0]!.preferences);
  });

  test('prepareForCounting anonymises and shuffles', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ token: `t${i}`, preferences: [`C${i}`] }));
    const out = prepareForCounting(many);
    expect(sorted(out)).toEqual(sorted(many.map((m) => m.preferences)));
    expect(out.map((b) => b[0])).not.toEqual(many.map((m) => m.preferences[0]));
    expect(JSON.stringify(out)).not.toContain('"t1"');
  });
});

describe('SR-03 ballot storage keeps no arrival-order information', () => {
  test('the ballots table has only a random id and the preferences', () => {
    const db = openDatabase();
    new BallotStore(db);
    const cols = (db.prepare("SELECT name FROM pragma_table_info('ballots')").all() as { name: string }[]).map((c) => c.name);
    expect(cols.sort()).toEqual(['id', 'preferences']);
    expect(() => db.prepare('SELECT rowid FROM ballots').all()).toThrow();
  });

  test('ballots come out of the store in a different order from how they went in', () => {
    const db = openDatabase();
    const store = new BallotStore(db);
    const inserted = Array.from({ length: 40 }, (_, i) => [`C${i}`]);
    inserted.forEach((p) => store.add(p));

    const batch = store.batchForCounting();
    expect(store.count()).toBe(40);
    expect(sorted(batch)).toEqual(sorted(inserted));
    expect(batch).not.toEqual(inserted);
  });
});
