import express, { Express, Response } from "express";
import Database from "better-sqlite3";
import { login, authMiddleware, AuthedRequest } from "./auth";
import { requireRole } from "./rbac";
import {
  createExclusionAction,
  listExclusionActions,
  approveExclusionAction,
  rejectExclusionAction,
  MakerCheckerError,
} from "./makerChecker";

export function createApp(db: Database.Database): Express {
  const app = express();
  app.use(express.json());

  app.post("/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    const token = login(db, username, password);
    if (!token) return res.status(401).json({ error: "Invalid username or password" });
    return res.status(200).json({ token });
  });

  app.post(
    "/exclusions",
    authMiddleware,
    requireRole("admin", "delegate"),
    (req: AuthedRequest, res: Response) => {
      const { candidateId, reason } = req.body ?? {};
      if (!candidateId || !reason) {
        return res.status(400).json({ error: "candidateId and reason are required" });
      }
      const action = createExclusionAction(db, req.user!.id, candidateId, reason);
      return res.status(201).json(action);
    }
  );

  app.get(
    "/exclusions",
    authMiddleware,
    requireRole("admin", "delegate", "auditor"),
    (_req: AuthedRequest, res: Response) => {
      return res.status(200).json(listExclusionActions(db));
    }
  );

  app.post(
    "/exclusions/:id/approve",
    authMiddleware,
    requireRole("admin", "delegate"),
    (req: AuthedRequest, res: Response) => {
      try {
        const action = approveExclusionAction(db, Number(req.params.id), req.user!.id);
        return res.status(200).json(action);
      } catch (err) {
        return handleMakerCheckerError(err, res);
      }
    }
  );

  app.post(
    "/exclusions/:id/reject",
    authMiddleware,
    requireRole("admin", "delegate"),
    (req: AuthedRequest, res: Response) => {
      try {
        const action = rejectExclusionAction(db, Number(req.params.id), req.user!.id);
        return res.status(200).json(action);
      } catch (err) {
        return handleMakerCheckerError(err, res);
      }
    }
  );

  return app;
}

function handleMakerCheckerError(err: unknown, res: Response) {
  if (err instanceof MakerCheckerError) {
    const statusByCode = { NOT_FOUND: 404, ALREADY_DECIDED: 409, SELF_APPROVAL_FORBIDDEN: 403 } as const;
    return res.status(statusByCode[err.code]).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
