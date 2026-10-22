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

export interface JwtLike {
  verify: (...args: any[]) => unknown;
}

export interface Auth {
  authenticate: Middleware;
  requireRole(...allowed: Role[]): Middleware;
  actorOf(user: AuthUser | undefined): string;
}

export function createAuth(options: { jwt: JwtLike; signingKey: string | undefined }): Auth;
export function requireRole(...allowed: Role[]): Middleware;
export function requireSigningKey(key: string | undefined, name?: string): string;
export function actorOf(user: AuthUser | undefined): string;
export const ROLES: readonly Role[];
export const MIN_KEY_LENGTH: number;
