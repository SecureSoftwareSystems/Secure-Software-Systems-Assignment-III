import { useEffect, useRef, useState } from "react";
import "./IntegrityConsole.css";
import {
  integrity,
  newBallotToken,
  type AuditEntry,
  type ChainVerification,
  type Contest,
  type CountResponse,
  type StoredResult,
} from "../integrityApi";
import type { Role } from "../types";

interface Props {
  token: string;
  role: Role;
  onLogout: () => void;
}

interface LogLine {
  id: number;
  action: string;
  status: number;
  message: string;
}

const SAMPLE_CANDIDATES = ["Memphis", "Nashville", "Chattanooga", "Knoxville"];
const SAMPLE_BLOCS: [string[], number][] = [
  [["Memphis", "Nashville", "Chattanooga", "Knoxville"], 42],
  [["Nashville", "Chattanooga", "Knoxville", "Memphis"], 26],
  [["Chattanooga", "Knoxville", "Nashville", "Memphis"], 15],
  [["Knoxville", "Chattanooga", "Nashville", "Memphis"], 17],
];

function shortHash(h?: string) {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";
}

export default function IntegrityConsole({ token, role, onLogout }: Props) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [candidates, setCandidates] = useState(SAMPLE_CANDIDATES.join(", "));
  const [count, setCount] = useState<CountResponse | null>(null);
  const [latest, setLatest] = useState<StoredResult | null>(null);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [lastTicket, setLastTicket] = useState<{ token: string; preferences: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const nextLogId = useRef(1);

  function record(action: string, status: number, message: string) {
    const id = nextLogId.current++;
    setLog((prev) => [{ id, action, status, message }, ...prev].slice(0, 12));
  }

  async function loadContest() {
    const r = await integrity.contest(token);
    if (r.ok) setContest(r.body);
    else record("Load contest", r.status, r.body.error ?? "could not load contest");
  }

  async function loadLatest() {
    const r = await integrity.latestResult(token);
    if (r.ok) setLatest(r.body);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [c, l] = await Promise.all([integrity.contest(token), integrity.latestResult(token)]);
        if (!active) return;
        if (c.ok) setContest(c.body);
        if (l.ok) setLatest(l.body);
      } catch {
        if (active) record("Load contest", 0, "vote-integrity service is not reachable on port 4002");
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      record(label, 0, "service not reachable");
    } finally {
      setBusy(false);
    }
  }

  const openContest = () =>
    run("Open contest", async () => {
      const list = candidates.split(",").map((c) => c.trim()).filter(Boolean);
      const r = await integrity.openContest(token, list);
      record("Open contest", r.status, r.ok ? `opened with ${list.length} candidates` : r.body.error ?? "refused");
      await loadContest();
    });

  const submitSampleBallots = () =>
    run("Submit ballots", async () => {
      let accepted = 0;
      let first: { token: string; preferences: string[] } | null = null;
      for (const [preferences, n] of SAMPLE_BLOCS) {
        for (let i = 0; i < n; i++) {
          const t = newBallotToken();
          const r = await integrity.submitBallot(token, t, preferences);
          if (!r.ok) {
            record("Submit ballots", r.status, r.body.error ?? "ballot refused");
            return;
          }
          first = first ?? { token: t, preferences };
          accepted += 1;
        }
      }
      setLastTicket(first);
      record("Submit ballots", 201, `${accepted} ballots accepted, each with a one-time ticket`);
    });

  const replayTicket = () =>
    run("Reuse a ticket", async () => {
      if (!lastTicket) return;
      const r = await integrity.submitBallot(token, lastTicket.token, lastTicket.preferences);
      record("Reuse a ticket", r.status, r.ok ? "accepted (unexpected)" : r.body.error ?? "refused");
    });

  const sendInvalidBallot = () =>
    run("Invalid ballot", async () => {
      const r = await integrity.submitBallot(token, newBallotToken(), ["Mallory"]);
      record("Invalid ballot", r.status, r.ok ? "accepted (unexpected)" : r.body.error ?? "rejected");
    });

  const closeContest = () =>
    run("Close intake", async () => {
      const r = await integrity.closeContest(token);
      record("Close intake", r.status, r.ok ? "no more ballots accepted" : r.body.error ?? "refused");
      await loadContest();
    });

  const runCount = () =>
    run("Run count", async () => {
      const r = await integrity.count(token);
      if (r.status === 200 || r.status === 409) {
        if (r.body.status) setCount(r.body);
      }
      const msg =
        r.body.status === "VERIFIED"
          ? `both counters agree: ${r.body.result?.winner} wins`
          : r.body.status === "HALTED"
            ? "counters disagree, result withheld"
            : r.body.error ?? "refused";
      record("Run count", r.status, msg);
      await loadLatest();
    });

  const loadAudit = () =>
    run("View audit log", async () => {
      const r = await integrity.auditEntries(token);
      if (r.ok) setEntries(r.body.entries);
      record("View audit log", r.status, r.ok ? `${r.body.entries.length} entries` : r.body.error ?? "refused");
    });

  const verifyChain = () =>
    run("Verify chain", async () => {
      const r = await integrity.verifyChain(token);
      if (r.status === 200 || r.status === 409) setChain(r.body);
      record(
        "Verify chain",
        r.status,
        r.body.valid === true
          ? `chain intact, ${r.body.checked} entries checked`
          : r.body.valid === false
            ? `broken at entry ${r.body.firstInvalidSeq}`
            : r.body.error ?? "refused",
      );
    });

  const takeCheckpoint = () =>
    run("Seal checkpoint", async () => {
      const r = await integrity.checkpoint(token);
      record(
        "Seal checkpoint",
        r.status,
        r.ok ? `signed seal of entry ${r.body.seq} ready for the isolated store` : r.body.error ?? "refused",
      );
    });

  const shown = count?.result ?? latest?.result ?? null;
  const shownHash = count?.resultHash ?? latest?.resultHash;
  const status = contest?.status ?? "unknown";

  return (
    <div className="dashboard integrity">
      <header>
        <h1>Vote Tabulation — Count &amp; Audit</h1>
        <div className="session-info">
          <span>
            Signed in as role <strong>{role}</strong>
          </span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      <main className="ic-grid">
        <section className="ic-card">
          <div className="ic-card-head">
            <h2>1 · Ballot intake</h2>
            <span className={`ic-pill ic-pill-${status}`}>{status}</span>
          </div>
          <p className="ic-hint">SR-07: every ballot carries a one-time ticket. Admin only.</p>
          {status === "setup" && (
            <div className="ic-row">
              <label className="ic-field">
                Candidates
                <input id="ic-candidates" value={candidates} onChange={(e) => setCandidates(e.target.value)} />
              </label>
              <button className="ic-primary" disabled={busy} onClick={openContest}>
                Open contest
              </button>
            </div>
          )}
          {status === "open" && (
            <div className="ic-actions">
              <button className="ic-primary" disabled={busy} onClick={submitSampleBallots}>
                Submit 100 sample ballots
              </button>
              <button disabled={busy || !lastTicket} onClick={replayTicket}>
                Reuse a ticket
              </button>
              <button disabled={busy} onClick={sendInvalidBallot}>
                Send an invalid ballot
              </button>
              <button disabled={busy} onClick={closeContest}>
                Close intake
              </button>
            </div>
          )}
          {status === "closed" && <p className="ic-note">Intake is closed. The ballot set is fixed and ready to count.</p>}
          {contest && contest.candidates.length > 0 && (
            <p className="ic-meta">Candidates: {contest.candidates.join(" · ")}</p>
          )}
        </section>

        <section className="ic-card">
          <div className="ic-card-head">
            <h2>2 · Count</h2>
            {count?.status && <span className={`ic-pill ic-pill-${count.status.toLowerCase()}`}>{count.status}</span>}
          </div>
          <p className="ic-hint">SR-03 shuffle, then SR-10 two separate counters that must agree. Delegate or admin.</p>
          <div className="ic-actions">
            <button className="ic-primary" disabled={busy} onClick={runCount}>
              Run count
            </button>
          </div>
          {count?.status === "HALTED" && (
            <div className="ic-halt" role="alert">
              <strong>Count stopped.</strong> The two counters disagree, so no result was published.
              <ul>
                {(count.discrepancies ?? []).slice(0, 5).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {shown && (
            <>
              <p className="ic-winner">
                Winner: <strong>{shown.winner}</strong>
                <span>
                  {shown.totalBallots} ballots · {shown.rounds.length} rounds
                </span>
              </p>
              <div className="ic-scroll">
                <table className="ic-table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      {Object.keys(shown.rounds[0]?.tallies ?? {}).map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                      <th>Excluded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.rounds.map((r) => (
                      <tr key={r.round}>
                        <td>{r.round}</td>
                        {Object.keys(shown.rounds[0]?.tallies ?? {}).map((c) => (
                          <td key={c}>{r.tallies[c] ?? "—"}</td>
                        ))}
                        <td>{r.excluded ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ic-meta">Result fingerprint: {shortHash(shownHash)}</p>
            </>
          )}
        </section>

        <section className="ic-card ic-wide">
          <div className="ic-card-head">
            <h2>3 · Audit log</h2>
            {chain && (
              <span className={`ic-pill ${chain.valid ? "ic-pill-verified" : "ic-pill-halted"}`}>
                {chain.valid ? "chain intact" : `broken at ${chain.firstInvalidSeq}`}
              </span>
            )}
          </div>
          <p className="ic-hint">SR-09: each entry is sealed to the one before it. Auditor or admin.</p>
          <div className="ic-actions">
            <button disabled={busy} onClick={loadAudit}>
              Show entries
            </button>
            <button className="ic-primary" disabled={busy} onClick={verifyChain}>
              Verify chain
            </button>
            <button disabled={busy} onClick={takeCheckpoint}>
              Seal checkpoint
            </button>
          </div>
          {entries && (
            <div className="ic-scroll">
              <table className="ic-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.seq}>
                      <td>{e.seq}</td>
                      <td>{new Date(e.ts).toLocaleTimeString()}</td>
                      <td>{e.actor}</td>
                      <td>{e.action}</td>
                      <td className="ic-mono">{shortHash(e.hash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="ic-card ic-wide">
          <div className="ic-card-head">
            <h2>Server responses</h2>
          </div>
          <p className="ic-hint">
            Every button is shown to every role on purpose: the server decides, so a wrong role gets 403 here.
          </p>
          {log.length === 0 ? (
            <p className="ic-note">Nothing yet. Responses from the service appear here.</p>
          ) : (
            <ul className="ic-log">
              {log.map((l) => (
                <li key={l.id}>
                  <span className={`ic-code ${l.status >= 200 && l.status < 300 ? "ok" : "bad"}`}>
                    {l.status || "—"}
                  </span>
                  <strong>{l.action}</strong>
                  <span>{l.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
