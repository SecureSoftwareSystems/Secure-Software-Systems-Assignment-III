import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

/**
 * JWT check + role check for this service.
 *
 * Uses the team's shared token format: HS256, signed with JWT_SIGNING_KEY,
 * 15-minute expiry, a `role` claim of admin | delegate | auditor.
 * Once services/auth-access-control is merged, this file should be
 * replaced by an import of that service's middleware, so there is only
 * one copy of the token-checking code.
 */
export const ROLES = ['admin', 'delegate', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  sub: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function authenticate(signingKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'missing bearer token' });
      return;
    }
    try {
      // Pin the algorithm so a token can't pick its own (e.g. "none").
      const payload = jwt.verify(token, signingKey, { algorithms: ['HS256'] });
      if (typeof payload !== 'object' || typeof payload.sub !== 'string' || !ROLES.includes(payload.role)) {
        res.status(401).json({ error: 'invalid token claims' });
        return;
      }
      req.user = { sub: payload.sub, role: payload.role as Role };
      next();
    } catch {
      // Same response for expired, tampered or wrongly signed tokens; no detail leaked.
      res.status(401).json({ error: 'invalid or expired token' });
    }
  };
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !allowed.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}
