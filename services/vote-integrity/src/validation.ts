import { z } from 'zod';

const candidateName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 .'-]*$/, 'candidate names may contain letters, digits, spaces and . \' -');

export const openContestSchema = z
  .object({
    candidates: z
      .array(candidateName)
      .min(2, 'at least two candidates')
      .max(50)
      .refine((c) => new Set(c).size === c.length, 'candidate names must be unique'),
  })
  .strict();

export const ballotTokenSchema = z
  .string()
  .min(22)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'token must be URL-safe characters only');

export function ballotSchema(candidates: readonly string[]) {
  const allowed = new Set(candidates);
  return z
    .object({
      token: ballotTokenSchema,
      preferences: z
        .array(z.string().max(64))
        .min(1, 'a ballot must rank at least one candidate')
        .max(Math.max(1, candidates.length))
        .refine((p) => new Set(p).size === p.length, 'a candidate can be ranked only once')
        .refine((p) => p.every((c) => allowed.has(c)), 'ballot ranks an unknown candidate'),
    })
    .strict();
}

// Error messages never echo the caller's input back (no reflected XSS).
export function describeIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    if (i.code === 'unrecognized_keys') return 'body: unexpected field(s) not allowed';
    return `${i.path.join('.') || 'body'}: ${i.message}`;
  });
}
