import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { isSealed, open, seal } from "@/server/credentials";
import { GoogleConnectionService } from "@/server/google-connection";
import { getGoogleAccessToken } from "@/server/google-tokens";
import { importLegacyInstallation } from "@/server/installation";
import { calendarScopes } from "@/server/auth-policy";
import { encryptCredentials } from "../scripts/migration/encrypt-credentials";
import { testDatabase } from "./database";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const key = (byte: number, id = "k1") => `${id}:${Buffer.alloc(32, byte).toString("base64")}`;

describe("sealed secrets", () => {
  it("round-trips and binds the ciphertext to its record and field", () => {
    const a = seal("refresh-secret", "account.refresh_token", "acc-1", key(1)), b = seal("refresh-secret", "account.refresh_token", "acc-1", key(1));
    expect(a).not.toContain("refresh-secret"); expect(a).not.toBe(b); // unique nonce
    expect(open(a, "account.refresh_token", "acc-1", key(1))).toBe("refresh-secret");
    expect(() => open(a, "account.refresh_token", "acc-2", key(1))).toThrow(/sleutel/);
    expect(() => open(a, "account.access_token", "acc-1", key(1))).toThrow(/sleutel/);
  });

  it("refuses tampering, a wrong or missing key and plaintext — there is no fallback", () => {
    const sealed = seal("secret", "oauthClient.clientSecret", "c", key(1)), parts = sealed.split(":");
    const body = Buffer.from(parts[5], "base64url"); body[0] ^= 1;
    expect(() => open([...parts.slice(0, 5), body.toString("base64url")].join(":"), "oauthClient.clientSecret", "c", key(1))).toThrow();
    expect(() => open(sealed, "oauthClient.clientSecret", "c", key(2))).toThrow(); // same id, other key
    expect(() => open(sealed, "oauthClient.clientSecret", "c", key(1, "k2"))).toThrow(); // unknown key id
    expect(() => open(sealed, "oauthClient.clientSecret", "c", "")).toThrow();
    expect(() => open("secret", "oauthClient.clientSecret", "c", key(1))).toThrow();
    expect(() => seal("x", "oauthClient.clientSecret", "c", "k1:short")).toThrow();
  });

  it("opens with an older key after rotation while sealing with the new one", () => {
    const old = seal("secret", "account.access_token", "a", key(1));
    const rotated = `${key(2, "k2")},${key(1)}`;
    expect(open(old, "account.access_token", "a", rotated)).toBe("secret");
    expect(seal("secret", "account.access_token", "a", rotated).split(":")[2]).toBe("k2");
  });
});

/** Every text value in every table of the test database. */
async function allText(db: PrismaClient) {
  const columns = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('text', 'character varying')`);
  const values: string[] = [];
  for (const c of columns) {
    const rows = await db.$queryRawUnsafe<{ v: string | null }[]>(`SELECT "${c.column_name}"::text AS v FROM "${c.table_name}"`);
    values.push(...rows.map(r => r.v ?? ""));
  }
  return values.join("\n");
}

describe("cutover conversion and plaintext scan", () => {
  it("seals R1 plaintext once in a transaction; the app then reads it, and no secret remains readable in the database", async () => {
    storage = testDatabase(); const db = storage.db;
    await db.user.create({ data: { id: "owner", email: "owner@example.test" } });
    await db.session.create({ data: { userId: "owner", sessionToken: "owner-session", expires: new Date(Date.now() + 3_600_000) } });
    await db.account.create({ data: { id: "account", userId: "owner", provider: "google", providerAccountId: "subject", type: "oauth",
      refresh_token: "r1-plain-refresh", access_token: "r1-plain-access", expires_at: 1, scope: calendarScopes.join(" ") } });
    await importLegacyInstallation(db, { allowedEmail: "owner@example.test", clientId: "client", clientSecret: "r1-plain-client-secret" });
    // Simulate the R1 state: the imported client secret was plaintext too.
    const client = await db.oAuthClientConfig.findFirstOrThrow();
    await db.oAuthClientConfig.update({ where: { id: client.id }, data: { clientSecret: "r1-plain-client-secret" } });

    // Without conversion the app refuses rather than using plaintext.
    await expect(getGoogleAccessToken(db, "account", () => async () => ({}))).rejects.toMatchObject({ code: "CREDENTIALS_UNAVAILABLE" });
    expect(await encryptCredentials(db)).toEqual({ accountTokens: 1, clientSecrets: 1, attemptTokens: 0, alreadySealed: 0 });
    expect(await encryptCredentials(db)).toMatchObject({ accountTokens: 0, clientSecrets: 0, alreadySealed: 3 });

    const used: string[] = [];
    const token = await getGoogleAccessToken(db, "account", (id, secret) => async refresh => { used.push(`${secret}/${refresh}`); return { access_token: "new-access", expiry_date: Date.now() + 3_600_000 }; });
    expect(token).toBe("new-access"); expect(used).toEqual(["r1-plain-client-secret/r1-plain-refresh"]);

    // A later connection keeps its pending tokens sealed too.
    const service = new GoogleConnectionService(db, () => async () => ({ access_token: "confirmed-access", expiry_date: Date.now() + 3_600_000 }), async () => Response.json({ items: [] }));
    const attempt = await service.begin("owner", "owner-session", { mode: "calendar" });
    await service.complete(attempt.id, "owner-session", "owner", { provider: "google", providerAccountId: "subject", type: "oauth", scope: calendarScopes.join(" "),
      access_token: "pending-access", refresh_token: "pending-refresh" }, { email: "owner@example.test", email_verified: true });
    expect(isSealed((await db.googleConnectionAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).tokensJson)).toBe(true);
    const text = await allText(db);
    for (const secret of ["r1-plain-refresh", "r1-plain-access", "r1-plain-client-secret", "new-access", "pending-access", "pending-refresh"]) expect(text).not.toContain(secret);
    await service.confirm("owner", "owner-session", attempt.id);
    const confirmed = await allText(db);
    for (const secret of ["pending-refresh", "confirmed-access"]) expect(confirmed).not.toContain(secret);
    expect(open((await db.account.findUniqueOrThrow({ where: { id: "account" } })).refresh_token!, "account.refresh_token", "account")).toBe("pending-refresh");
  });
});
