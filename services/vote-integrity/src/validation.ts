import { z } from 'zod';

/**
 * Request schemas for this service. Everything is checked server-side
 * before it reaches the business logic (team's secure coding standard,
 * SR-18): unknown fields are rejected (.strict()), lengths are bounded,
 * and names use a restricted character set.
 */

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

/** Ballot tokens: URL-safe base64 / hex, long enough to be unguessable (>= 128 bits). */
export const ballotTokenSchema = z
  .string()
  .min(22)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'token must be URL-safe characters only');

/**
 * A ballot is a ranked list of candidates (most preferred first). Partial rankings
 * are allowed (optional preferential), duplicates and unknown candidates are not.
 */
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

/**
 * Turns a zod error into short client-facing messages without echoing the input back:
 * zod's "Unrecognized key(s) in object: '<key>'" would repeat whatever field name the
 * caller sent (e.g. a <script> tag), so that case gets a generic message instead.
 */
export function describeIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    if (i.code === 'unrecognized_keys') return 'body: unexpected field(s) not allowed';
    return `${i.path.join('.') || 'body'}: ${i.message}`;
  });
}
