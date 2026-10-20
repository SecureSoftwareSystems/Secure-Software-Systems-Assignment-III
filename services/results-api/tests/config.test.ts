import { loadConfig, parseReleaseAt } from '../src/config';

const strong = 'x'.repeat(32);

describe('configuration fails closed', () => {
  test('refuses to start without a JWT key', () => {
    expect(() => loadConfig({ RESULTS_RELEASE_AT: '2026-10-24T18:00:00+11:00' })).toThrow(/JWT_SIGNING_KEY/);
  });

  test('refuses a release time without a timezone, or no release time at all', () => {
    expect(() => parseReleaseAt('2026-10-24 18:00')).toThrow(/timezone/);
    expect(() => parseReleaseAt(undefined)).toThrow(/RESULTS_RELEASE_AT/);
  });

  test('loads a valid configuration', () => {
    const cfg = loadConfig({ JWT_SIGNING_KEY: strong, RESULTS_RELEASE_AT: '2026-10-24T18:00:00+11:00' });
    expect(cfg.releaseAt.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(cfg.port).toBe(4003);
  });
});
