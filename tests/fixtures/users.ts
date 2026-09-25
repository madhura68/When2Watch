import { seal } from "@/server/credentials";
import type { PrismaClient } from "@prisma/client";
import { calendarScopes } from "@/server/auth-policy";

/** An ACTIVE R2 user with own Google account, connection and (optionally) an active calendar binding. */
export async function activeUser(db: PrismaClient, id: string, options: { role?: "ADMIN" | "USER"; calendarId?: string | null; scope?: string } = {}) {
  const calendarId = options.calendarId === undefined ? `${id}-cal@example.test` : options.calendarId;
  await db.user.create({ data: { id, email: `${id}@example.test`, name: id, role: options.role ?? "USER", accessStatus: "ACTIVE" } });
  const account = await db.account.create({ data: { id: `acc-${id}`, userId: id, type: "oauth", provider: "google", providerAccountId: `sub-${id}`,
    refresh_token: seal(`refresh-${id}`, "account.refresh_token", `acc-${id}`), access_token: seal("synthetic-access", "account.access_token", `acc-${id}`), expires_at: Math.floor(Date.now() / 1000) + 3600,
    scope: options.scope ?? [...calendarScopes].join(" ") } });
  await db.userConnection.create({ data: { userId: id, accountId: account.id } });
  const binding = calendarId ? await db.calendarBinding.create({ data: { userId: id, accountId: account.id, calendarId, status: "ACTIVE", provenance: "APP_CREATED",
    summary: "When2Watch", timeZone: "Europe/Amsterdam", accessRole: "owner", defaultRemindersJson: "[]", confirmedAt: new Date() } }) : null;
  return { id, account, binding };
}

export async function installation(db: PrismaClient, ownerId: string) {
  const client = await db.oAuthClientConfig.create({ data: { id: "client", clientId: "synthetic.apps.googleusercontent.com", clientSecret: seal("synthetic-secret", "oauthClient.clientSecret", "client") } });
  return db.installation.create({ data: { id: "singleton", ownerId, oauthClientConfigId: client.id } });
}

/** Gives an existing (legacy-style) test user an own account, connection and active calendar binding. */
export async function bindCalendar(db: PrismaClient, userId: string, calendarId: string) {
  const accountId = `acc-${userId}`;
  if (!await db.account.findUnique({ where: { id: accountId } })) {
    await db.account.create({ data: { id: accountId, userId, type: "oauth", provider: "google", providerAccountId: `sub-${userId}`, refresh_token: seal("synthetic", "account.refresh_token", accountId),
      access_token: seal("synthetic-access", "account.access_token", accountId), expires_at: Math.floor(Date.now() / 1000) + 3600, scope: [...calendarScopes].join(" ") } });
    await db.userConnection.create({ data: { userId, accountId } });
  }
  await db.user.update({ where: { id: userId }, data: { accessStatus: "ACTIVE" } });
  return db.calendarBinding.create({ data: { userId, accountId, calendarId, status: "ACTIVE", provenance: "APP_CREATED",
    summary: "When2Watch", timeZone: "Europe/Amsterdam", accessRole: "owner", defaultRemindersJson: "[]", confirmedAt: new Date() } });
}
