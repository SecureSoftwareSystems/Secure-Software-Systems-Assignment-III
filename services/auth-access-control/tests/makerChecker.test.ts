import request from "supertest";
import { createDb } from "../src/db";
import { createUser, login } from "../src/auth";
import { createApp } from "../src/app";

describe("Maker-checker dual control (SR-08 — the direct fix for T8)", () => {
  function setup() {
    const db = createDb(":memory:");
    createUser(db, "delegate1", "pw", "delegate");
    createUser(db, "delegate2", "pw", "delegate");
    const app = createApp(db);
    const maker = login(db, "delegate1", "pw")!;
    const checker = login(db, "delegate2", "pw")!;
    return { app, maker, checker };
  }

  test("a newly created exclusion action starts in 'pending' status", async () => {
    const { app, maker } = setup();
    const res = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${maker}`)
      .send({ candidateId: "C7", reason: "ballot anomaly" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.checker_id).toBeNull();
  });

  test("THE CORE CONTROL: the maker cannot approve their own exclusion action", async () => {
    const { app, maker } = setup();
    const created = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${maker}`)
      .send({ candidateId: "C7", reason: "ballot anomaly" });

    const res = await request(app)
      .post(`/exclusions/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${maker}`); 

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/self-approval/i);
  });

  test("a second, different delegate CAN approve a pending action, and it takes effect", async () => {
    const { app, maker, checker } = setup();
    const created = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${maker}`)
      .send({ candidateId: "C7", reason: "ballot anomaly" });

    const res = await request(app)
      .post(`/exclusions/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${checker}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.checker_id).not.toBeNull();
  });

  test("a second, different delegate CAN reject a pending action, and it is discarded (not applied)", async () => {
    const { app, maker, checker } = setup();
    const created = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${maker}`)
      .send({ candidateId: "C7", reason: "ballot anomaly" });

    const res = await request(app)
      .post(`/exclusions/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${checker}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  test("an already-decided action cannot be decided a second time (no re-approving a rejected action)", async () => {
    const { app, maker, checker } = setup();
    const created = await request(app)
      .post("/exclusions")
      .set("Authorization", `Bearer ${maker}`)
      .send({ candidateId: "C7", reason: "ballot anomaly" });

    await request(app).post(`/exclusions/${created.body.id}/reject`).set("Authorization", `Bearer ${checker}`);

    const res = await request(app)
      .post(`/exclusions/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${checker}`);

    expect(res.status).toBe(409);
  });

  test("approving a non-existent action returns 404, not a silent success", async () => {
    const { app, checker } = setup();
    const res = await request(app).post("/exclusions/99999/approve").set("Authorization", `Bearer ${checker}`);
    expect(res.status).toBe(404);
  });
});
