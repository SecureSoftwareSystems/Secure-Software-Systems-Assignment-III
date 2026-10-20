import request from "supertest";
import { createDb } from "../src/db";
import { createUser, login } from "../src/auth";
import { createApp } from "../src/app";

describe("RBAC / least privilege (SR-15)", () => {
  function setup() {
    const db = createDb(":memory:");
    createUser(db, "admin1", "pw", "admin");
    createUser(db, "delegate1", "pw", "delegate");
    createUser(db, "auditor1", "pw", "auditor");
    const app = createApp(db);
    const adminToken = login(db, "admin1", "pw")!;
    const delegateToken = login(db, "delegate1", "pw")!;
    const auditorToken = login(db, "auditor1", "pw")!;
    return { app, adminToken, delegateToken, auditorToken };
  }

  test("an auditor (read-only role) cannot create an exclusion action", async () => {
    const { app, auditorToken } = setup();
    const res = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ candidateId: "C1", reason: "test" });
    expect(res.status).toBe(403);
  });

  test("an auditor cannot approve an exclusion action", async () => {
    const { app, adminToken, auditorToken } = setup();
    const created = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ candidateId: "C1", reason: "test" });

    const res = await request(app)
      .post(`/exclusions/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(res.status).toBe(403);
  });

  test("an auditor CAN read the exclusion list (visibility without write access)", async () => {
    const { app, auditorToken } = setup();
    const res = await request(app).get("/exclusions").set("Authorization", `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("a delegate CAN create an exclusion action (not an admin-only action)", async () => {
    const { app, delegateToken } = setup();
    const res = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${delegateToken}`)
      .send({ candidateId: "C1", reason: "test" });
    expect(res.status).toBe(201);
  });

  test("an unauthenticated request to a protected route is rejected before role is even checked", async () => {
    const { app } = setup();
    const res = await request(app).post("/exclusions").send({ candidateId: "C1", reason: "test" });
    expect(res.status).toBe(401);
  });
});
