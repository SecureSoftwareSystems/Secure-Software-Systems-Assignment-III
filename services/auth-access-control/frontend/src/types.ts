export type Role = "admin" | "delegate" | "auditor";

//Shape of a row returned by the exclusion-action endpoints.
export interface ExclusionAction {
  id: number;
  candidate_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  maker_id: number;
  checker_id: number | null;
  decided_at: string | null;
}
