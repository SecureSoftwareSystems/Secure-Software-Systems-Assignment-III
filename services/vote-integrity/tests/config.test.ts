import { loadConfig } from '../src/config';

const strong = 'x'.repeat(32);

describe('configuration fails closed (SR-16)', () => {
  test('refuses to start without JWT_SIGNING_KEY', () => {
    expect(() => loadConfig({ AUDIT_LOG_HMAC_KEY: strong })).toThrow(/JWT_SIGNING_KEY/);
  });

  test('refuses a weak AUDIT_LOG_HMAC_KEY', () => {
    expect(() => loadConfig({ JWT_SIGNING_KEY: strong, AUDIT_LOG_HMAC_KEY: 'short' })).toThrow(/AUDIT_LOG_HMAC_KEY/);
  });

  test('loads when both secrets are strong', () => {
    const cfg = loadConfig({ JWT_SIGNING_KEY: strong, AUDIT_LOG_HMAC_KEY: strong });
    expect(cfg.port).toBe(4002);
  });
});
