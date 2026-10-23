import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';


export interface RoundResult {
  round: number;
  tallies: Record<string, number>;
  exhausted: number;
  excluded: string | null;
}

export interface CountResult {
  winner: string;
  rounds: RoundResult[];
  totalBallots: number;
}

export interface VerifiedResult {
  result: CountResult;
  resultHash: string;
  ballotSetHash: string;
  countedAt: string;
}

export interface ResultsSource {
  latest(): Promise<VerifiedResult | null>;
}

export class IntegrityError extends Error {}
export class SourceUnavailableError extends Error {}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) out[key] = sortKeys((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

export function assertIntegrity(v: VerifiedResult): VerifiedResult {
  const actual = createHash('sha256').update(canonicalJson(v.result)).digest('hex');
  if (actual !== v.resultHash) throw new IntegrityError('result does not match its recorded hash');
  return v;
}

export class VoteIntegrityClient implements ResultsSource {
  private cached?: { value: VerifiedResult | null; at: number };

  constructor(
    private readonly baseUrl: string,
    private readonly jwtSigningKey: string,
    private readonly cacheMs = 15_000,
  ) {}

  async latest(): Promise<VerifiedResult | null> {
    if (this.cached && Date.now() - this.cached.at < this.cacheMs) return this.cached.value;

    const token = jwt.sign({ sub: 'svc:results-api', role: 'auditor', username: 'svc:results-api' }, this.jwtSigningKey, {
      algorithm: 'HS256',
      expiresIn: 60,
    });

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/results/latest`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new SourceUnavailableError('vote-integrity service unreachable');
    }

    let value: VerifiedResult | null;
    if (res.status === 404) value = null;
    else if (res.ok) value = assertIntegrity((await res.json()) as VerifiedResult);
    else throw new SourceUnavailableError(`vote-integrity responded ${res.status}`);

    this.cached = { value, at: Date.now() };
    return value;
  }
}
