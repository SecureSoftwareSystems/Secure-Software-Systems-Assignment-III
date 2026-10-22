import jwt from 'jsonwebtoken';
import { actorOf, createAuth, type Auth, type AuthUser, type Role } from '../../shared-auth';

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
