/**
 * Configuration from environment variables only (SR-16). The service fails
 * closed: a missing or weak secret, or a missing release time, stops it starting.
 */
export interface Config {
  port: number;
  jwtSigningKey: string;
  /** Results are withheld from the public until this instant (SR-11). */
  releaseAt: Date;
  voteIntegrityUrl: string;
  /** Number of reverse-proxy hops in front of the service (SR-13), so rate limiting sees the real client IP. */
  trustProxy: number;
  /** AES-256 key for personal data at rest (SR-20), 64 hex characters. */
  dataEncryptionKey: string;
  dbPath: string;
}

const MIN_SECRET_LENGTH = 32;

function requireSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be set and at least ${MIN_SECRET_LENGTH} characters (see .env.example)`);
  }
  return value;
}

function requireHexKey(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be 64 hex characters (256 bits)`);
  return value;
}

export function parseReleaseAt(raw: string | undefined): Date {
  // Require a full ISO-8601 timestamp with an explicit offset, so "9am" can't mean different things on different servers.
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    throw new Error('RESULTS_RELEASE_AT must be an ISO-8601 time with a timezone, e.g. 2026-10-24T18:00:00+11:00');
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error('RESULTS_RELEASE_AT is not a valid date');
  return d;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 4003);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number');
  const trustProxy = Number(env.TRUST_PROXY ?? 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) throw new Error('TRUST_PROXY must be 0-5');
  return {
    port,
    jwtSigningKey: requireSecret(env, 'JWT_SIGNING_KEY'),
    releaseAt: parseReleaseAt(env.RESULTS_RELEASE_AT),
    voteIntegrityUrl: env.VOTE_INTEGRITY_URL ?? 'http://127.0.0.1:4002',
    trustProxy,
    dataEncryptionKey: requireHexKey(env, 'DATA_ENCRYPTION_KEY'),
    dbPath: env.RESULTS_DB_PATH ?? 'data/results-api.db',
  };
}
