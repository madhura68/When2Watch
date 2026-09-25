import { afterEach, describe, expect, it } from "vitest";
import { accessFor, adminFor, signInAllowed } from "@/server/user-access";
import { testDatabase } from "./database";
import { activeUser } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const verified = { email: "x@example.test", email_verified: true };

describe("current access", () => {
  it("accepts only a session whose user is ACTIVE right now", async () => {
    storage = testDatabase(); const db = storage.db;
    await activeUser(db, "a"); await activeUser(db, "admin", { role: "ADMIN" });
    expect(await accessFor(db, "a")).toEqual({ id: "a", email: "a@example.test", role: "USER" });
    await expect(accessFor(db, undefined)).rejects.toMatchObject({ status: 401 });
    await expect(accessFor(db, "missing")).rejects.toMatchObject({ status: 401 });
    for (const accessStatus of ["BLOCKED", "UNCLAIMED"] as const) {
      await db.user.update({ where: { id: "a" }, data: { accessStatus } });
      await expect(accessFor(db, "a")).rejects.toMatchObject({ status: 401 });
    }
  });

  it("gives admin actions only to an active ADMIN (403 otherwise)", async () => {
    storage = testDatabase(); const db = storage.db;
    await activeUser(db, "a"); await activeUser(db, "admin", { role: "ADMIN" });
    await expect(adminFor(db, "a")).rejects.toMatchObject({ status: 403 });
    expect(await adminFor(db, "admin")).toMatchObject({ id: "admin", role: "ADMIN" });
    await db.user.update({ where: { id: "admin" }, data: { accessStatus: "BLOCKED" } });
    await expect(adminFor(db, "admin")).rejects.toMatchObject({ status: 401 });
  });
});

describe("login identity", () => {
  it("lets a verified Google subject in only when it maps to an ACTIVE user; no merge on email", async () => {
    storage = testDatabase(); const db = storage.db;
    await activeUser(db, "a");
    await db.user.create({ data: { id: "old", email: "old@example.test" } });
    await db.account.create({ data: { userId: "old", type: "oauth", provider: "google", providerAccountId: "sub-old" } });
    const google = (sub: string) => ({ provider: "google", providerAccountId: sub, type: "oauth" as const });
    expect(await signInAllowed(db, google("sub-a"), verified)).toBe(true);
    // Login is independent of Calendar consent: identity scopes alone suffice.
    expect(await signInAllowed(db, { ...google("sub-a"), scope: "openid email profile" } as never, verified)).toBe(true);
    expect(await signInAllowed(db, google("sub-a"), { ...verified, email_verified: false })).toBe(false);
    // UNCLAIMED legacy profile is not activated by logging in.
    expect(await signInAllowed(db, google("sub-old"), verified)).toBe(false);
    // Unknown subject with an existing user's email: no account merge, no free registration.
    expect(await signInAllowed(db, google("sub-new"), { email: "a@example.test", email_verified: true })).toBe(false);
    expect(await signInAllowed(db, { ...google("sub-a"), provider: "github" }, verified)).toBe(false);
    await db.user.update({ where: { id: "a" }, data: { accessStatus: "BLOCKED" } });
    expect(await signInAllowed(db, google("sub-a"), verified)).toBe(false);
  });
});
