export interface ApiResult<T> {
  status: number;
  ok: boolean;
  body: T & { error?: string; issues?: string[] };
}

export interface Contest {
  candidates: string[];
  status: "setup" | "open" | "closed";
}

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

export interface CountResponse {
  status: "VERIFIED" | "HALTED";
  result?: CountResult;
  resultHash?: string;
  ballotSetHash?: string;
  auditSeq?: number;
  discrepancies?: string[];
}

export interface StoredResult {
  result: CountResult;
  resultHash: string;
  ballotSetHash: string;
  countedAt: string;
}

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  details: string;
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  firstInvalidSeq?: number;
  reason?: string;
}

export interface Checkpoint {
  seq: number;
  hash: string;
  hmac: string;
}

const BASE = "/api/integrity";

async function call<T>(method: string, path: string, token: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as ApiResult<T>["body"];
  return { status: res.status, ok: res.ok, body: json };
}

export function newBallotToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const integrity = {
  contest: (t: string) => call<Contest>("GET", "/contest", t),
  openContest: (t: string, candidates: string[]) => call<Contest>("POST", "/contest", t, { candidates }),
  submitBallot: (t: string, token: string, preferences: string[]) =>
    call<{ accepted: boolean }>("POST", "/ballots", t, { token, preferences }),
  closeContest: (t: string) => call<Contest>("POST", "/contest/close", t),
  count: (t: string) => call<CountResponse>("POST", "/count", t),
  latestResult: (t: string) => call<StoredResult>("GET", "/results/latest", t),
  auditEntries: (t: string) => call<{ entries: AuditEntry[] }>("GET", "/audit", t),
  verifyChain: (t: string) => call<ChainVerification>("GET", "/audit/verify", t),
  checkpoint: (t: string) => call<Checkpoint>("POST", "/audit/checkpoint", t),
};
