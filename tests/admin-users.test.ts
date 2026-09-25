import { afterEach, expect, it } from "vitest";
import { blockUser, listUsers, reactivateUser } from "@/server/admin-users";
import { accessFor } from "@/server/user-access";
import { serializeCalendarMutation } from "@/server/calendar-mutations";
import { testDatabase } from "./database";
import { activeUser } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });

async function setup() {
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "admin", { role: "ADMIN" }); await activeUser(db, "user");
  await db.session.createMany({ data: [
    { userId: "user", sessionToken: "user-session", expires: new Date(Date.now() + 3600_000) },
    { userId: "admin", sessionToken: "admin-session", expires: new Date(Date.now() + 3600_000) },
  ] });
  return db;
}

it("lists users with access data only, for admins only", async () => {
  const db = await setup();
  await db.trackedShow.create({ data: { userId: "user", tvmazeId: 1, title: "Private series", sourceUrl: "x", status: "x" } });
  const users = await listUsers(db, "admin");
  expect(users).toEqual(expect.arrayContaining([expect.objectContaining({ id: "user", email: "user@example.test", role: "USER", accessStatus: "ACTIVE" })]));
  expect(JSON.stringify(users)).not.toMatch(/Private series|cal@example|refresh/);
  await expect(listUsers(db, "user")).rejects.toMatchObject({ status: 403 });
});

it("blocks under the user's lock: access, sessions and new work stop; an in-flight action finishes first", async () => {
  const db = await setup();
  let finished = false;
  const inFlight = serializeCalendarMutation("user", async () => { await new Promise(r => setTimeout(r, 50)); finished = true; });
  await blockUser(db, "admin", "user");
  expect(finished).toBe(true);
  await inFlight;
  await expect(accessFor(db, "user")).rejects.toMatchObject({ status: 401 });
  expect(await db.session.count({ where: { userId: "user" } })).toBe(0);
  expect(await db.auditEvent.findFirst({ where: { action: "user.blocked" } })).toMatchObject({ actorId: "admin", targetId: "user" });
  await reactivateUser(db, "admin", "user");
  expect(await accessFor(db, "user")).toMatchObject({ id: "user" });
});

it("never blocks the last active admin", async () => {
  const db = await setup();
  await expect(blockUser(db, "admin", "admin")).rejects.toMatchObject({ code: "LAST_ADMIN" });
  await expect(blockUser(db, "user", "admin")).rejects.toMatchObject({ status: 403 });
  expect(await accessFor(db, "admin")).toMatchObject({ role: "ADMIN" });
});
