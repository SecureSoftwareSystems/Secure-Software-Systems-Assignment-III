import { useEffect, useState, type SubmitEvent } from "react";
import "./ExclusionDashboard.css"
import {
  listExclusions,
  createExclusion,
  approveExclusion,
  rejectExclusion,
  ApiError,
} from "../api";
import type { ExclusionAction, Role } from "../types";

interface Props {
  token: string;
  role: Role;
  userId: number;
  onLogout: () => void;
}

export default function ExclusionsDashboard({ token, role, userId, onLogout }: Props) {
  const [actions, setActions] = useState<ExclusionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canWrite = role === "admin" || role === "delegate";

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listExclusions(token)
      setActions(data.slice().sort((a,b) => a.id - b.id));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load exclusion actions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDecision(id: number, decision: "approve" | "reject") {
    setActionError(null);
    try {
      const updated =
        decision === "approve" ? await approveExclusion(token, id) : await rejectExclusion(token, id);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not record decision.");
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Vote Tabulation — Admin Console</h1>
        <div className="session-info">
          <span>
            Signed in as role <strong>{role}</strong>
          </span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      {canWrite && <CreateExclusionForm token={token} onCreated={refresh} />}

      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Candidate</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Maker</th>
              <th>Checker</th>
              {canWrite && <th>Decide</th>}
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.candidate_id}</td>
                <td>{a.reason}</td>
                <td className={`status status-${a.status}`}>{a.status}</td>
                <td>{a.maker_id}</td>
                <td>{a.checker_id ?? "—"}</td>
                {canWrite && (
                  <td>
                    {a.status !== "pending" ? (
                      "—"
                    ) : a.maker_id === userId ? (
                      <span
                        className="hint"
                        title="You created this action — a different delegate/admin must decide it (SR-08 maker-checker)"
                      >
                        Awaiting another approver
                      </span>
                    ) : (
                      <>
                        <button onClick={() => handleDecision(a.id, "approve")}>Approve</button>
                        <button onClick={() => handleDecision(a.id, "reject")}>Reject</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {actions.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 7 : 6}>No exclusion actions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateExclusionForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [candidateId, setCandidateId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createExclusion(token, candidateId, reason);
      setCandidateId("");
      setReason("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create exclusion action.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="create-form">
      <h2>New exclusion / recount action</h2>
      <label>
        Candidate ID
        <input value={candidateId} onChange={(e) => setCandidateId(e.target.value)} required />
      </label>
      <label>
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Create"}
      </button>
    </form>
  );
}
