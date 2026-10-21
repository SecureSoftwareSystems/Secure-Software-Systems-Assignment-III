// Single point of contact with Rita's RBAC middleware.
import { requireRole } from "../../auth-access-control/src/rbac";
 
// Writes: admin and delegate only (auditors get 403).
export const requireTallyWrite = requireRole("admin", "delegate");
 
// Reads: also allow auditors to view results.
export const requireTallyRead = requireRole("admin", "delegate", "auditor");