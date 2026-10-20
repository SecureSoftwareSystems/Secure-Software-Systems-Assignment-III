import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';

/**
 * SR-18 — server-side input validation.
 *
 * Every route declares what it accepts (query string, path parameters,
 * headers, body) as zod schemas. Anything else is rejected with 400 before
 * the route's logic runs:
 *   - unknown fields and unknown query parameters are rejected (.strict()),
 *     so callers can't smuggle in options the code doesn't expect;
 *   - lengths and character sets are bounded;
 *   - validated, typed values replace the raw ones, so handlers only ever
 *     see checked data.
 * Data from other services is validated the same way (upstreamResultSchema):
 * it is input too.
 */

export interface RouteSchemas {
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  body?: ZodTypeAny;
  headers?: ZodTypeAny;
}

/**
 * One issue as a short message. Messages that would quote the caller's input
 * (unknown key names, invalid enum values) are replaced with generic ones, so
 * nothing the caller sent is reflected back (no reflected XSS via error bodies).
 * Only paths from our own schema are included.
 */
export function describeIssue(part: string, i: z.ZodIssue): string {
  if (i.code === 'unrecognized_keys') return `${part}: unexpected field(s) not allowed`;
  const path = i.path.length && i.code !== 'invalid_enum_value' ? '.' + i.path.join('.') : '';
  const message = i.code === 'invalid_enum_value' ? 'value not allowed' : i.message;
  return `${part}${path}: ${message}`;
}

/** Use for routes that take no query parameters at all. */
export const noQuery = z.object({}).strict();

export function validate(schemas: RouteSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const issues: string[] = [];
    const check = (part: keyof RouteSchemas, value: unknown): unknown => {
      const schema = schemas[part];
      if (!schema) return value;
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        for (const i of parsed.error.issues) issues.push(describeIssue(part, i));
        return value;
      }
      return parsed.data;
    };

    const query = check('query', req.query);
    const params = check('params', req.params);
    const body = check('body', req.body);
    check('headers', req.headers);

    if (issues.length > 0) {
      // Describe what was wrong without echoing the caller's input back.
      res.status(400).json({ error: 'invalid request', issues: issues.slice(0, 10) });
      return;
    }
    // Express 4 lets us replace these with the validated, typed versions.
    req.query = query as Request['query'];
    req.params = params as Request['params'];
    req.body = body;
    next();
  };
}

/** Optional Authorization header: if present it must look like a bearer token, and be of sane length. */
export const authHeaderSchema = z
  .object({
    authorization: z
      .string()
      .max(2048, 'authorization header too long')
      .regex(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'authorization must be "Bearer <jwt>"')
      .optional(),
  })
  .passthrough(); // other headers (user-agent, accept, ...) are not ours to police

const candidateName = z.string().min(1).max(64);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** Shape of a verified result coming back from vote-integrity. */
export const upstreamResultSchema = z
  .object({
    id: z.number().int().optional(),
    result: z
      .object({
        winner: candidateName,
        totalBallots: z.number().int().positive(),
        rounds: z
          .array(
            z
              .object({
                round: z.number().int().positive(),
                tallies: z.record(candidateName, z.number().int().nonnegative()),
                exhausted: z.number().int().nonnegative(),
                excluded: candidateName.nullable(),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict(),
    resultHash: hex64,
    ballotSetHash: hex64,
    countedAt: z.string().datetime(),
  })
  .strict();
