import jwt from 'jsonwebtoken';
import { actorOf, createAuth, type Auth, type AuthUser, type Role } from '../../shared-auth';

/**
 * Authentication and role checks for this service come from the team's shared
 * middleware (services/shared-auth, owned by Rita), the same code that
 * auth-access-control uses. Tokens are the ones its POST /auth/login issues:
 * HS256, signed with JWT_SIGNING_KEY, 15-minute expiry, role admin | delegate | auditor.
 */
export type { Role, AuthUser };

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function createServiceAuth(signingKey: string): Auth {
  return createAuth({ jwt, signingKey });
}

export const actor = (user: AuthUser | undefined): string => actorOf(user);
