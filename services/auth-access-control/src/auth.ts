import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import Database from "better-sqlite3";
import { Role, Users } from "./db";

import { createAuth, requireSigningKey, type Auth } from "../../shared-auth";

const TOKEN_TTL = "15m";

function signingKey(): string {
  return requireSigningKey(process.env.JWT_SIGNING_KEY);
}

let shared: Auth | undefined;
function sharedAuth(): Auth {
  return (shared ??= createAuth({ jwt, signingKey: signingKey() }));
}

export interface AuthedRequest extends Request {
  user?: { id: number; role: Role; username?: string };
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function createUser(db: Database.Database, username: string, password: string, role: Role): Users {
  const password_hash = hashPassword(password);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
    .run(username, password_hash, role);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as Users;
}

/**
 * SR-01 (analysis-only in this prototype): voter MFA is out of scope for the
 * Vote Counting & Tabulation subsystem. This login function is for the
 * delegate/admin/auditor console only, and is deliberately simple (password +
 * short-lived JWT). A production recount console would add a second factor
 * here too (see the Part One write-up for SR-01's rationale).
 */
export function login(db: Database.Database, username: string, password: string): string | null {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Users | undefined;
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, signingKey(), {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL,
  });
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  return sharedAuth().authenticate(req, res, next);
}
