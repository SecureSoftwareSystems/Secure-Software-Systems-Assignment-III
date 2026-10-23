import Database from "better-sqlite3";
import { ExclusionActions } from "./db";


export class MakerCheckerError extends Error {
  constructor(message: string, public code: "NOT_FOUND" | "ALREADY_DECIDED" | "SELF_APPROVAL_FORBIDDEN") {
    super(message);
  }
}

export function createExclusionAction(
  db: Database.Database,
  makerId: number,
  candidateId: string,
  reason: string
): ExclusionActions {
  const info = db
    .prepare(`INSERT INTO exclusion_actions (candidate_id, reason, maker_id) VALUES (?, ?, ?)`)
    .run(candidateId, reason, makerId);
  return getAction(db, Number(info.lastInsertRowid));
}

export function listExclusionActions(db: Database.Database): ExclusionActions[] {
  return db.prepare("SELECT * FROM exclusion_actions ORDER BY created_at DESC").all() as ExclusionActions[];
}

export function getAction(db: Database.Database, id: number): ExclusionActions {
  const row = db.prepare("SELECT * FROM exclusion_actions WHERE id = ?").get(id) as ExclusionActions | undefined;
  if (!row) throw new MakerCheckerError(`Exclusion action ${id} not found`, "NOT_FOUND");
  return row;
}

function decide(db: Database.Database, id: number, checkerId: number, outcome: "approved" | "rejected"): ExclusionActions {
  const action = getAction(db, id);

  if (action.status !== "pending") {
    throw new MakerCheckerError(`Exclusion action ${id} has already been ${action.status}`, "ALREADY_DECIDED");
  }


  if (action.maker_id === checkerId) {
    throw new MakerCheckerError(
      "A delegate cannot approve or reject their own exclusion action (self-approval is forbidden)",
      "SELF_APPROVAL_FORBIDDEN"
    );
  }

  db.prepare(
    `UPDATE exclusion_actions SET status = ?, checker_id = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(outcome, checkerId, id);

  return getAction(db, id);
}

export function approveExclusionAction(db: Database.Database, id: number, checkerId: number): ExclusionActions {
  return decide(db, id, checkerId, "approved");
}

export function rejectExclusionAction(db: Database.Database, id: number, checkerId: number): ExclusionActions {
  return decide(db, id, checkerId, "rejected");
}
