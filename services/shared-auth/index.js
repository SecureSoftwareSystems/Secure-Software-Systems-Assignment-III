'use strict';

const ROLES = Object.freeze(['admin', 'delegate', 'auditor']);
const MIN_KEY_LENGTH = 32;

// Fail closed: no default key, and short keys are refused (SR-16).
function requireSigningKey(key, name = 'JWT_SIGNING_KEY') {
  if (typeof key !== 'string' || key.length < MIN_KEY_LENGTH) {
    throw new Error(`${name} must be set and at least ${MIN_KEY_LENGTH} characters (see .env.example)`);
  }
  return key;
}

function createAuth(options) {
  const { jwt, signingKey } = options || {};
  if (!jwt || typeof jwt.verify !== 'function') throw new Error('createAuth needs the jsonwebtoken module as `jwt`');
  const key = requireSigningKey(signingKey);

  function authenticate(req, res, next) {
    const header = (req.headers && req.headers.authorization) || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }
    let payload;
    try {
      // HS256 pinned, so a token cannot choose "none" or another algorithm.
      payload = jwt.verify(parts[1], key, { algorithms: ['HS256'] });
    } catch (_err) {
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

function actorOf(user) {
  if (!user) return 'anonymous';
  return user.username || `user-${user.id}`;
}

module.exports = { createAuth, requireRole, requireSigningKey, actorOf, ROLES, MIN_KEY_LENGTH };
