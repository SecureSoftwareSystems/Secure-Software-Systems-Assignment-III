import type { Role } from "./types";

export interface DecodedToken {
  sub: number;
  role: Role;
  iat: number;
  exp: number;
}

export function decodeJwtPayload(token: string): DecodedToken | null {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as DecodedToken;
  } catch {
    return null;
  }
}
