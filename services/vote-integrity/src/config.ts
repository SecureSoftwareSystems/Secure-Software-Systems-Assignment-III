export interface Config {
  port: number;
  dbPath: string;
  jwtSigningKey: string;
  auditHmacKey: string;
}

const MIN_SECRET_LENGTH = 32;

function requireSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be set and at least ${MIN_SECRET_LENGTH} characters (see .env.example)`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 4002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number');
  return {
    port,
    dbPath: env.VOTE_INTEGRITY_DB_PATH ?? 'data/vote-integrity.db',
    jwtSigningKey: requireSecret(env, 'JWT_SIGNING_KEY'),
    auditHmacKey: requireSecret(env, 'AUDIT_LOG_HMAC_KEY'),
  };
}
