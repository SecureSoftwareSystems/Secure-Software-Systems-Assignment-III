import type { Response, NextFunction } from "express";
import type { Role } from "./db";
import type { AuthedRequest } from "./auth";
import { requireRole as sharedRequireRole } from "../../shared-auth";

/**
 * SR-15 — Role-based access control (least privilege).
 *
 * Three roles for this subsystem:
 *  - admin:    full access (break-glass only, should be rarely used day-to-day)
 *  - delegate: can create and decide (approve/reject) recount/exclusion actions,
 *              but never their own (see SR-08 maker-checker in makerChecker.ts)
 *  - auditor:  read-only — can view everything, can change nothing
 *
 * This middleware is deliberately generic (pass the allowed roles per route)
 * rather than one big if/else, so every route states its own minimum required
 * privilege right next to its handler — this is what "least privilege" means
 * in code, not just in the report.
 */
export function requireRole(...allowed: Role[]) {
  return sharedRequireRole(...allowed) as (req: AuthedRequest, res: Response, next: NextFunction) => void;
}
