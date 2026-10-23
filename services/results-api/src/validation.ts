import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';



export interface RouteSchemas {
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  body?: ZodTypeAny;
  headers?: ZodTypeAny;
}


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
      res.status(400).json({ error: 'invalid request', issues: issues.slice(0, 10) });
      return;
    }
    req.query = query as Request['query'];
    req.params = params as Request['params'];
    req.body = body;
    next();
  };
}

export const authHeaderSchema = z
  .object({
    authorization: z
      .string()
      .max(2048, 'authorization header too long')
      .regex(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'authorization must be "Bearer <jwt>"')
      .optional(),
  })
  .passthrough(); 
const candidateName = z.string().min(1).max(64);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

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
