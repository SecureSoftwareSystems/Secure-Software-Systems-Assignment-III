import { requireSigningKey } from "../../shared-auth";
import { createDb } from "./db";
import { createUser } from "./auth";
import { createApp } from "./app";

requireSigningKey(process.env.JWT_SIGNING_KEY);

const DB_PATH = process.env.DB_PATH || "./tabulation.db";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const db = createDb(DB_PATH);

const existing = db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
if (existing.n === 0) {
  createUser(db, "admin", "ChangeMe123!", "admin");
  createUser(db, "delegate1", "ChangeMe123!", "delegate");
  createUser(db, "delegate2", "ChangeMe123!", "delegate");
  createUser(db, "auditor1", "ChangeMe123!", "auditor");
  console.log("Seeded demo accounts: admin, delegate1, delegate2, auditor1 (password: ChangeMe123!)");
}

const app = createApp(db);
app.listen(PORT, () => {
  console.log(`Auth & Access Control service listening on http://localhost:${PORT}`);
});
