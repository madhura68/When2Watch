import { open, seal } from "@/server/credentials";
import { afterEach, expect, it, vi } from "vitest";
import { testDatabase } from "./database";
import { importLegacyInstallation } from "@/server/installation";
import { GoogleConnectionService } from "@/server/google-connection";
import { calendarScopes } from "@/server/auth-policy";

let storage: ReturnType<typeof testDatabase>;
vi.mock("@/server/db", () => ({ database: () => storage.db }));
const { authOptions } = await import("@/server/auth");
afterEach(async () => { await storage?.close(); vi.unstubAllEnvs(); });

it("uses the verified OAuth callback profile when NextAuth passes a normalized profile to the sign-in event", async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://when2watch.example.test"); vi.stubEnv("NEXTAUTH_SECRET", "synthetic-session-secret");
  storage = testDatabase(); const db = storage.db;
  const user = { id: "owner", email: "owner@example.test", name: "Owner", emailVerified: null };
  await db.user.create({ data: user });
  await db.account.create({ data: { id: "account", userId: user.id, provider: "google", providerAccountId: "subject", type: "oauth", refresh_token: seal("existing-refresh", "account.refresh_token", "account") } });
  await db.session.create({ data: { userId: user.id, sessionToken: "current-session", expires: new Date(Date.now()+3600000) } });
  await importLegacyInstallation(db, { allowedEmail: user.email, clientId: "synthetic-client", clientSecret: "synthetic-secret" });
  const service = new GoogleConnectionService(db), attempt = await service.begin(user.id,"current-session",{mode:"calendar"});
  const options = await authOptions({attemptId:attempt.id,sessionToken:"current-session"});
  const account = { provider: "google", providerAccountId: "subject", type: "oauth" as const, scope: calendarScopes.join(" "), access_token: "candidate-access", refresh_token: "candidate-refresh" };
  const rawProfile = { sub: "subject", email: user.email, email_verified: true, name: "Verified name" };
  expect(await options.callbacks!.signIn!({ user, account, profile: rawProfile })).toBe(true);
  // next-auth/core/routes/callback.js passes provider-normalized profile here;
  // email_verified exists only on OAuthProfile supplied to callbacks.signIn.
  await options.events!.signIn!({ user, account, profile: { email:user.email, name:"Normalized name" }, isNewUser:false });
  expect(await db.googleConnectionAttempt.findUnique({where:{id:attempt.id}})).toMatchObject({status:"completed",profileName:"Verified name"});
  expect(open((await db.account.findUniqueOrThrow({where:{id:"account"}})).refresh_token!,"account.refresh_token","account")).toBe("existing-refresh");
});
