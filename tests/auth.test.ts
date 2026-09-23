import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { isAllowedGoogleSignIn, requireIdentity } from "@/server/auth-policy";
import { getGoogleAccessToken, saveGoogleTokens } from "@/server/google-tokens";
import { testDatabase } from "./database";

const email = "owner@example.com";
const scope = "openid email profile https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events";
const account = { provider: "google", providerAccountId: "google-owner", type: "oauth" as const, scope };
const profile = { email, email_verified: true };

describe("Google account adapter", () => {
  it("persists the optional refresh-token lifetime returned by Google", async () => {
    const database = testDatabase();
    try {
      const user = await database.db.user.create({ data: { email } });
      const providerReply = {
        ...account, userId: user.id,
        access_token: "test-access", refresh_token: "test-refresh",
        expires_at: 1_800_000_000, token_type: "Bearer", id_token: "test-id-token",
        refresh_token_expires_in: 604_800,
      };
      await PrismaAdapter(database.db).linkAccount!(providerReply);
      const linked = await database.db.account.findFirstOrThrow();
      expect(linked).toMatchObject({
        providerAccountId: account.providerAccountId, userId: user.id,
        refresh_token: "test-refresh", refresh_token_expires_in: 604_800,
      });
    } finally { await database.close(); }
  });
});

describe("Google authorization boundary", () => {
  it("accepts only the verified allowlisted Google identity with both Calendar scopes", () => {
    expect(isAllowedGoogleSignIn(account, profile, email)).toBe(true);
    expect(isAllowedGoogleSignIn(account, { ...profile, email: "intruder@example.com" }, email)).toBe(false);
    expect(isAllowedGoogleSignIn(account, { ...profile, email_verified: false }, email)).toBe(false);
    expect(isAllowedGoogleSignIn({ ...account, provider: "other" }, profile, email)).toBe(false);
    expect(isAllowedGoogleSignIn(account, profile, "")).toBe(false);
  });

  it("rejects partial consent and missing verified-email claims", () => {
    expect(isAllowedGoogleSignIn({ ...account, scope: "openid email profile" }, profile, email)).toBe(false);
    expect(isAllowedGoogleSignIn({ ...account, scope: scope.replace(" https://www.googleapis.com/auth/calendar.events", "") }, profile, email)).toBe(false);
    expect(isAllowedGoogleSignIn(account, { email }, email)).toBe(false);
  });

  it("requires a server session for every private operation", () => {
    expect(() => requireIdentity(null, email)).toThrow();
    expect(() => requireIdentity({ user: { id: "u2", email: "intruder@example.com" } }, email)).toThrow();
    expect(() => requireIdentity({ user: { email } }, email)).toThrow();
    expect(requireIdentity({ user: { id: "u1", email } }, email)).toEqual({ id: "u1", email });
  });
});

describe("persisted Google credentials", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeAll(async () => {
    database = testDatabase();
    await database.db.user.create({ data: { id: "owner", email } });
    await database.db.account.create({ data: { ...account, userId: "owner", refresh_token: "existing-refresh", access_token: "expired", expires_at: 1 } });
  });
  afterAll(async () => { await database?.close(); });

  it("retains a refresh token when a later sign-in omits it, including across a DB reopen", async () => {
    await saveGoogleTokens(database.db, "owner", { ...account, access_token: "fresh-access", expires_at: 1 });
    const reopened = database.reopen();
    try {
      const saved = await reopened.account.findFirstOrThrow();
      expect(saved.refresh_token).toBe("existing-refresh");
      expect(saved.access_token).toBe("fresh-access");
      expect(saved.userId).toBe("owner");
    } finally { await reopened.$disconnect(); }
  });

  it("refreshes an expired access token and saves the result without losing the refresh token", async () => {
    const token = await getGoogleAccessToken(database.db, "owner", async (refresh) => {
      expect(refresh).toBe("existing-refresh");
      return { access_token: "renewed-access", expiry_date: Date.now() + 3_600_000 };
    });
    expect(token).toBe("renewed-access");
    const saved = await database.db.account.findFirstOrThrow();
    expect(saved.refresh_token).toBe("existing-refresh");
    expect(saved.access_token).toBe("renewed-access");
    await expect(getGoogleAccessToken(database.db, "owner", async () => { throw new Error("must not refresh a valid token"); })).resolves.toBe("renewed-access");
  });

  it("marks revoked consent as reconnect-needed without disclosing provider errors", async () => {
    await database.db.account.updateMany({ data: { expires_at: 1 } });
    await expect(getGoogleAccessToken(database.db, "owner", async () => {
      throw { response: { data: { error: "invalid_grant", error_description: "sensitive-provider-detail" } } };
    })).rejects.toMatchObject({ code: "RECONNECT_GOOGLE" });
    expect((await database.db.account.findFirstOrThrow()).needsReauth).toBe(true);
  });
});
