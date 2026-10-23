import request from "supertest";
import { createDb } from "../src/db";
import { createUser } from "../src/auth";
import { createApp } from "../src/app";

describe("Authentication (supports SR-01 context + SR-17 session expiry)", () => {
  function setup() {
    const db = createDb(":memory:");
    createUser(db, "delegate1", "correct-horse-battery-staple", "delegate");
    const app = createApp(db);
    return { db, app };
  }

  test("login succeeds with valid credentials and returns a token", async () => {
    const { app } = setup();
    const res = await request(app).post("/auth/login").send({ username: "delegate1", password: "correct-horse-battery-staple" });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  test("login fails with an invalid password", async () => {
    const { app } = setup();
    const res = await request(app).post("/auth/login").send({ username: "delegate1", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  test("login fails for a username that does not exist", async () => {
    const { app } = setup();
    const res = await request(app).post("/auth/login").send({ username: "nobody", password: "anything" });
    expect(res.status).toBe(401);
  });

  test("a protected route rejects requests with no Authorization header", async () => {
    const { app } = setup();
    const res = await request(app).get("/exclusions");
    expect(res.status).toBe(401);
  });

  test("a protected route rejects an invalid/garbage token", async () => {
    const { app } = setup();
    const res = await request(app).get("/exclusions").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
  test("passwords are hashed, not stored in plaintext", () => {
    const { db } = setup();
    const row = db.prepare("SELECT password_hash FROM users WHERE username = ?").get("delegate1") as { password_hash: string };
    expect(row.password_hash).not.toBe("correct-horse-battery-staple");
    expect(row.password_hash.startsWith("$2")).toBe(true); 
   });
});
