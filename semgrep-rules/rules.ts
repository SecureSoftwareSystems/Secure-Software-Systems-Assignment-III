import { randomInt } from "crypto";
import jwt from "jsonwebtoken";

export function bad(input: string, token: string): number {
  // ruleid: no-eval
  eval(input);
  // ruleid: no-eval
  const f = new Function(input);
  // ruleid: no-jwt-decode-without-verify
  const claims = jwt.decode(token);
  // ruleid: no-insecure-random
  return Math.floor(Math.random() * 10);
}

export function shuffle<T>(ballots: T[]): T[] {
  const out = [...ballots];
  for (let i = out.length - 1; i > 0; i--) {
    // ok: no-insecure-random
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function good(input: string, token: string, key: string) {
  // ok: no-eval
  JSON.parse(input);
  // ok: no-jwt-decode-without-verify
  return jwt.verify(token, key);
}
