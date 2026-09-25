import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
vi.mock("@/server/db", () => ({ database: () => storage.db }));
const { acceptInvitation, createInvitation, exchangeInvitation, revokeInvitation, invitationCookieValue } = await import("@/server/invitations");
const { authOptions } = await import("@/server/auth");
const { signInAllowed } = await import("@/server/user-access");
// The real NextAuth 4.24.15 handler that runs after callbacks.signIn (core/routes/callback.js).
const { default: callbackHandler } = createRequire(import.meta.url)("../node_modules/next-auth/core/lib/callback-handler.js") as { default: (params: unknown) => Promise<{ user: { id: string }; session: { userId: string } | null; isNewUser: boolean }> };

afterEach(async () => { await storage?.close(); vi.unstubAllEnvs(); });
const now = new Date("2026-09-26T10:00:00Z");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const google = (sub: string) => ({ provider: "google", providerAccountId: sub, type: "oauth" as const, access_token: "never-store", refresh_token: "never-store", scope: "openid email profile" });
const profile = (email: string, verified = true) => ({ sub: "x", email, email_verified: verified, name: "Invited" });

async function setup() {
  vi.stubEnv("NEXTAUTH_URL", "https://when2watch.example.test"); vi.stubEnv("NEXTAUTH_SECRET", "synthetic-session-secret");
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "admin", { role: "ADMIN" }); await activeUser(db, "user");
  await installation(db, "admin");
  return db;
}

/** callbacks.signIn → real callbackHandler, exactly as NextAuth's OAuth callback route does it. */
async function oauthCallback(cookie: string | undefined, sub: string, email: string, options: { verified?: boolean; sessionToken?: string } = {}) {
  const auth = await authOptions(undefined, cookie ? { cookie, sessionToken: options.sessionToken ?? "" } : undefined);
  const account = google(sub), oauthProfile = profile(email, options.verified ?? true);
  const allowed = await auth.callbacks!.signIn!({ user: { id: sub, email }, account, profile: oauthProfile });
  if (allowed !== true) return { allowed, result: null };
  const result = await callbackHandler({ sessionToken: options.sessionToken, profile: { id: sub, email, name: "Invited" }, account,
    options: { adapter: auth.adapter, events: auth.events ?? {}, jwt: {}, session: { strategy: "database", maxAge: 3600, generateSessionToken: randomUUID } } });
  return { allowed, result };
}

describe("creating and exchanging invitations", () => {
  it("stores only a hash of a 32-byte token for 72 hours and returns a fragment link once", async () => {
    const db = await setup();
    const { token, path, invitation } = await createInvitation(db, "admin", "  New.Person+tv@Example.test ", now);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(path).toBe(`/uitnodiging#token=${token}`);
    const stored = await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored).toMatchObject({ email: "new.person+tv@example.test", tokenHash: sha(token), acceptedAt: null, revokedAt: null, expiresAt: new Date(+now + 72 * 3600_000) });
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(await db.auditEvent.findFirst({ where: { action: "invitation.created" } })).toMatchObject({ actorId: "admin", targetId: invitation.id });
  });

  it("is admin-only and replacing an invitation revokes the open previous link", async () => {
    const db = await setup();
    await expect(createInvitation(db, "user", "x@example.test", now)).rejects.toMatchObject({ status: 403 });
    const first = await createInvitation(db, "admin", "x@example.test", now), second = await createInvitation(db, "admin", "x@example.test", now);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: first.invitation.id } })).revokedAt).not.toBeNull();
    await expect(exchangeInvitation(db, first.token, now)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    expect(await exchangeInvitation(db, second.token, now)).toMatchObject({ flowId: expect.any(String) });
  });

  it("exchanges a valid token for a 15-minute browser flow without claiming it; every invalid token gets the same answer", async () => {
    const db = await setup();
    const { token, invitation } = await createInvitation(db, "admin", "x@example.test", now);
    const flow = await exchangeInvitation(db, token, now);
    const stored = await db.invitationFlow.findUniqueOrThrow({ where: { id: flow.flowId } });
    expect(stored).toMatchObject({ invitationId: invitation.id, browserSecretHash: sha(flow.secret), expiresAt: new Date(+now + 15 * 60_000) });
    expect((await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).acceptedAt).toBeNull();
    const errors = await Promise.all(["not-a-token", token.slice(1)].map(t => exchangeInvitation(db, t, now).catch(e => e)));
    await revokeInvitation(db, "admin", invitation.id);
    errors.push(await exchangeInvitation(db, token, now).catch(e => e));
    const late = await createInvitation(db, "admin", "late@example.test", now);
    errors.push(await exchangeInvitation(db, late.token, new Date(+now + 73 * 3600_000)).catch(e => e));
    expect(new Set(errors.map(e => `${e.code}:${e.status}:${e.message}`)).size).toBe(1);
    expect(errors[0]).toMatchObject({ code: "INVITATION_INVALID", status: 400 });
  });
});

describe("accepting through the real NextAuth callback order", () => {
  it("activates exactly the invited verified Google identity and lets NextAuth create only the session", async () => {
    const db = await setup();
    const { token, invitation } = await createInvitation(db, "admin", "invited@example.test", now);
    const flow = await exchangeInvitation(db, token, new Date());
    const { allowed, result } = await oauthCallback(invitationCookieValue(flow), "sub-invited", "Invited@Example.test");
    expect(allowed).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "invited@example.test" } });
    expect(user).toMatchObject({ role: "USER", accessStatus: "ACTIVE" });
    expect(result).toMatchObject({ isNewUser: false, user: { id: user.id }, session: { userId: user.id } });
    const account = await db.account.findUniqueOrThrow({ where: { provider_providerAccountId: { provider: "google", providerAccountId: "sub-invited" } } });
    expect(account).toMatchObject({ userId: user.id, access_token: null, refresh_token: null });
    expect((await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).acceptedAt).not.toBeNull();
    expect(await db.invitationFlow.count()).toBe(0);
    // Crash recovery is an ordinary login of the same ACTIVE identity.
    expect(await signInAllowed(db, google("sub-invited"), profile("invited@example.test"))).toBe(true);
    // A used token cannot start a new flow.
    await expect(exchangeInvitation(db, token, new Date())).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("refuses a wrong, unverified or other-user identity and acceptance while another user is signed in", async () => {
    const db = await setup();
    const { token } = await createInvitation(db, "admin", "invited@example.test", now);
    const cookie = invitationCookieValue(await exchangeInvitation(db, token, new Date()));
    expect((await oauthCallback(cookie, "sub-other", "someone-else@example.test")).allowed).toBe(false);
    expect((await oauthCallback(cookie, "sub-invited", "invited@example.test", { verified: false })).allowed).toBe(false);
    // The Google identity of an existing different user is never re-linked.
    expect((await oauthCallback(cookie, "sub-user", "invited@example.test")).allowed).toBe(false);
    await db.session.create({ data: { userId: "user", sessionToken: "user-session", expires: new Date(Date.now() + 3600_000) } });
    expect((await oauthCallback(cookie, "sub-invited", "invited@example.test", { sessionToken: "user-session" })).allowed).toBe(false);
    expect(await db.user.count({ where: { email: "invited@example.test" } })).toBe(0);
    // A forged browser secret does not unlock the flow.
    const [flowId] = cookie.split(".");
    expect((await oauthCallback(`${flowId}.forged`, "sub-invited", "invited@example.test")).allowed).toBe(false);
  });

  it("gives exactly one activation for two simultaneous acceptances", async () => {
    const db = await setup();
    const { token, invitation } = await createInvitation(db, "admin", "race@example.test", now);
    const flows = [await exchangeInvitation(db, token, new Date()), await exchangeInvitation(db, token, new Date())];
    const results = await Promise.all(flows.map(flow => acceptInvitation(db, invitationCookieValue(flow), google("sub-race"), profile("race@example.test")).then(() => "ok", () => "refused")));
    expect(results).toContain("ok");
    expect(await db.user.count({ where: { email: "race@example.test" } })).toBe(1);
    expect(await db.account.count({ where: { providerAccountId: "sub-race" } })).toBe(1);
    expect(await db.invitation.count({ where: { id: invitation.id, acceptedAt: { not: null } } })).toBe(1);
  });

  it("does not register freely: an unknown identity without invitation is refused", async () => {
    const db = await setup();
    expect((await oauthCallback(undefined, "sub-stranger", "stranger@example.test")).allowed).toBe(false);
    expect(await db.user.count({ where: { email: "stranger@example.test" } })).toBe(0);
  });
});
