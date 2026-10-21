
import { requireRole } from "../../auth-access-control/src/rbac";

export const requireTallyWrite = requireRole("admin", "delegate");
 

export const requireTallyRead = requireRole("admin", "delegate", "auditor");