import jwt from 'jsonwebtoken';
import { openDatabase } from '../src/db';
import { createApp } from '../src/app';
import type { Role } from '../src/auth';

export const JWT_KEY = 'test-only-jwt-signing-key-0123456789abcdef';
export const HMAC_KEY = 'test-only-hmac-key-0123456789abcdef0123456789';

export function tokenFor(role: Role, sub = `${role}-1`, key = JWT_KEY, expiresIn: string | number = '15m'): string {
  return jwt.sign({ sub, role }, key, { algorithm: 'HS256', expiresIn } as jwt.SignOptions);
}

export function bearer(role: Role): string {
  return `Bearer ${tokenFor(role)}`;
}

export function makeApp() {
  const db = openDatabase();
  const app = createApp({ db, jwtSigningKey: JWT_KEY, auditHmacKey: HMAC_KEY });
  return { db, app };
}
