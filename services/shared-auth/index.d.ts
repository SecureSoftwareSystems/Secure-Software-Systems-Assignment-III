// Types for @evote/shared-auth. Structural types only, so this file needs no
// other packages installed next to it (each service brings its own Express types).

export type Role = 'admin' | 'delegate' | 'auditor';

export interface AuthUser {
  id: number | string;
  role: Role;
  username?: string;
}

export interface MinimalRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}

export interface MinimalResponse {
  status(code: number): { json(body: unknown): unknown };
}

export type Middleware = (req: any, res: any, next: (err?: unknown) => void) => void;

/** The jsonwebtoken module (or anything with a compatible verify). Kept loose so any @types/jsonwebtoken version fits. */
export interface JwtLike {
  verify: (...args: any[]) => unknown;
}

export interface Auth {
  /** Verifies the bearer token; sets req.user or answers 401. */
  authenticate: Middleware;
  /** Answers 401 if not signed in, 403 if the role is not allowed. */
  requireRole(...allowed: Role[]): Middleware;
  actorOf(user: AuthUser | undefined): string;
}

export function createAuth(options: { jwt: JwtLike; signingKey: string | undefined }): Auth;
export function requireRole(...allowed: Role[]): Middleware;
export function requireSigningKey(key: string | undefined, name?: string): string;
export function actorOf(user: AuthUser | undefined): string;
export const ROLES: readonly Role[];
export const MIN_KEY_LENGTH: number;
