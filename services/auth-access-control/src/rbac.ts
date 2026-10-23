import type { Response, NextFunction } from "express";
import type { Role } from "./db";
import type { AuthedRequest } from "./auth";
import { requireRole as sharedRequireRole } from "../../shared-auth";


export function requireRole(...allowed: Role[]) {
  return sharedRequireRole(...allowed) as (req: AuthedRequest, res: Response, next: NextFunction) => void;
}
