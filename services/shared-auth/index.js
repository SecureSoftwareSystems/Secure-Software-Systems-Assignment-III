'use strict';
/**
 * @evote/shared-auth — the team's one authentication + authorisation middleware.
 * Owner: Rita (SR-15 RBAC, SR-17 session expiry). Used by every service:
 *   auth-access-control (issues tokens at /auth/login), vote-integrity, results-api,
 *   availability-resilience.
 *
 * Token contract (issued by auth-access-control):
 *   HS256 JWT signed with JWT_SIGNING_KEY, 15-minute expiry,
 *   claims { sub: <user id>, role: 'admin' | 'delegate' | 'auditor', username?: string }
 *
 * This package has NO runtime dependencies on purpose: CI installs each service
 * on its own, and a linked package's dependencies are not installed. Each service
 * passes in its own `jsonwebtoken`, so verification still uses the standard library.
 */

const ROLES = Object.freeze(['admin', 'delegate', 'auditor']);
const MIN_KEY_LENGTH = 32;

/** Fails closed: no default secret, and short secrets are refused (SR-16). */
function requireSigningKey(key, name = 'JWT_SIGNING_KEY') {
  if (typeof key !== 'string' || key.length < MIN_KEY_LENGTH) {
    throw new Error(`${name} must be set and at least ${MIN_KEY_LENGTH} characters (see .env.example)`);
  }
  return key;
}

/**
 * @param {{ jwt: { verify: Function }, signingKey: string }} options
 * @returns {{ authenticate: Function, requireRole: Function, actorOf: Function }}
 */
function createAuth(options) {
  const { jwt, signingKey } = options || {};
  if (!jwt || typeof jwt.verify !== 'function') throw new Error('createAuth needs the jsonwebtoken module as `jwt`');
  const key = requireSigningKey(signingKey);

  /** Verifies the bearer token and sets req.user = { id, role, username }. */
  function authenticate(req, res, next) {
    const header = (req.headers && req.headers.authorization) || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }
    let payload;
    try {
      // Algorithm pinned: a token cannot choose "none" or switch to another algorithm.
      payload = jwt.verify(parts[1], key, { algorithms: ['HS256'] });
    } catch (_err) {
      // Same answer for expired, tampered or wrongly signed tokens; no detail leaked.
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    const id = payload && payload.sub;
    const idOk = (typeof id === 'number' && Number.isInteger(id)) || (typeof id === 'string' && id.length > 0 && id.length <= 128);
    if (!idOk || !ROLES.includes(payload.role)) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    req.user = {
      id,
      role: payload.role,
      username: typeof payload.username === 'string' ? payload.username.slice(0, 64) : undefined,
    };
    next();
  }

  return { authenticate, requireRole, actorOf };
}

/** Least privilege: each route names the roles it allows. 401 if not signed in, 403 if the role is wrong. Needs no key. */
function requireRole(...allowed) {
  for (const r of allowed) if (!ROLES.includes(r)) throw new Error(`unknown role: ${r}`);
  return function roleCheck(req, res, next) {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: `Role '${req.user.role}' is not permitted to perform this action` });
      return;
    }
    next();
  };
}

/** A stable, human-readable name for audit logs: the username if the token has one, else "user-<id>". */
function actorOf(user) {
  if (!user) return 'anonymous';
  return user.username || `user-${user.id}`;
}

module.exports = { createAuth, requireRole, requireSigningKey, actorOf, ROLES, MIN_KEY_LENGTH };
