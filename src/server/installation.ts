import type { PrismaClient } from "@prisma/client";
import { database } from "./db";
import { AppError } from "./errors";
import { hasCalendarScopes } from "./auth-policy";
import { serializeCalendarMutation } from "./calendar-mutations";
import { getPreferences } from "./preferences";
import { bindingUsable, connectionAccount, getActiveBinding } from "./calendar-bindings";

export type LegacyInstallation = { allowedEmail: string; clientId: string; clientSecret: string; calendarId?: string };
export function legacyInstallation(): LegacyInstallation | null {
  const { ALLOWED_GOOGLE_EMAIL: email, GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_CALENDAR_ID: calendarId } = process.env;
  return email?.trim() && clientId?.trim() && clientSecret?.trim()
    ? { allowedEmail: email.trim().toLowerCase(), clientId: clientId.trim(), clientSecret: clientSecret.trim(), calendarId: calendarId?.trim() } : null;
}

export async function importLegacyInstallation(db: PrismaClient, legacy: LegacyInstallation | null) {
  return serializeCalendarMutation("installation-import", async () => {
    const existing = await db.installation.findUnique({ where: { id: "singleton" } });
    if (existing) return existing;
    const users = await db.user.findMany({ include: { accounts: { where: { provider: "google" } }, calendar: true } });
    if (!users.length) return null;
    const matches = legacy ? users.filter(user => user.email?.trim().toLowerCase() === legacy.allowedEmail.toLowerCase()) : [];
    if (!legacy || matches.length !== 1 || matches[0].accounts.length !== 1 ||
        users.some(user => user.id !== matches[0].id && user.accounts.length > 0) ||
        (matches[0].calendar && legacy.calendarId && matches[0].calendar.calendarId !== legacy.calendarId)) {
      throw new AppError("INSTALLATION_AMBIGUOUS", 503, "De bestaande eigenaar of agenda is niet eenduidig. Controleer de oude installatieconfiguratie voordat je doorgaat.");
    }
    const owner = matches[0], account = owner.accounts[0];
    return db.$transaction(async tx => {
      const client = await tx.oAuthClientConfig.create({ data: { clientId: legacy.clientId, clientSecret: legacy.clientSecret } });
      await tx.account.update({ where: { id: account.id }, data: { oauthClientConfigId: client.id, profileEmail: owner.email, profileName: owner.name } });
      // The proven existing owner becomes the only initial admin, with its own Calendar account.
      await tx.user.update({ where: { id: owner.id }, data: { role: "ADMIN", accessStatus: "ACTIVE" } });
      await tx.userConnection.create({ data: { userId: owner.id, accountId: account.id } });
      return tx.installation.create({ data: { id: "singleton", ownerId: owner.id, activeAccountId: account.id,
        oauthClientConfigId: client.id, initialCalendarId: owner.calendar ? null : legacy.calendarId || null } });
    });
  });
}

export async function getInstallation(db: PrismaClient = database()) {
  return await db.installation.findUnique({ where: { id: "singleton" } }) ?? importLegacyInstallation(db, legacyInstallation());
}

/** Settings view of one user: own login profile, own Calendar account and own active calendar. No secrets. */
export async function userSettings(db: PrismaClient, userId: string) {
  const [user, account, active, preferences, attempts, creation, installation] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, role: true } }),
    connectionAccount(db, userId), getActiveBinding(db, userId), getPreferences(userId, db),
    db.googleConnectionAttempt.findMany({ where: { ownerId: userId, status: { in: ["pending", "completed"] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }, take: 1, select: { id: true, mode: true, status: true, profileEmail: true } }),
    db.calendarCreationAttempt.findFirst({ where: { ownerId: userId, status: { in: ["sending", "uncertain", "created", "ready"] } }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, timeZone: true, status: true, calendarId: true } }),
    db.installation.findUnique({ where: { id: "singleton" }, select: { ownerId: true, initialCalendarId: true } }),
  ]);
  const binding = "binding" in active ? active.binding : null;
  return { account: { email: account?.profileEmail ?? user.email, name: account?.profileName ?? user.name }, isAdmin: user.role === "ADMIN", preferences,
    calendarPermission: hasCalendarScopes(account?.scope),
    needsReauth: !account || account.needsReauth || !account.refresh_token, calendarReady: !!binding,
    calendar: binding ? { id: binding.calendarId, name: binding.summary ?? binding.calendarId, timeZone: binding.timeZone ?? preferences.timeZone,
      confirmedAt: (binding.confirmedAt ?? binding.createdAt).toISOString(), appCreated: binding.provenance === "APP_CREATED",
      // "legacy": not created by When2Watch; "permission": grants missing. Sync is paused in both cases.
      state: "binding" in active ? bindingUsable(active.binding, active.account) : "ok" } : null,
    // Bootstrap hint from the legacy configuration, shown only to the installation owner until a calendar is chosen.
    initialCalendarId: !binding && installation?.ownerId === userId ? installation.initialCalendarId : null,
    connectionAttempt: attempts[0] ?? null, calendarCreation: creation };
}
