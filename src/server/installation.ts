import type { PrismaClient } from "@prisma/client";
import { database } from "./db";
import { AppError } from "./errors";
import { hasCalendarScopes, calendarCreationScope } from "./auth-policy";
import { serializeCalendarMutation } from "./calendar-mutations";
import { getPreferences } from "./preferences";

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
      return tx.installation.create({ data: { id: "singleton", ownerId: owner.id, activeAccountId: account.id,
        oauthClientConfigId: client.id, initialCalendarId: owner.calendar ? null : legacy.calendarId || null } });
    });
  });
}

export async function getInstallation(db: PrismaClient = database()) {
  return await db.installation.findUnique({ where: { id: "singleton" } }) ?? importLegacyInstallation(db, legacyInstallation());
}

export async function ownerInstallation(db: PrismaClient, userId: string) {
  const installation = await getInstallation(db);
  if (!installation || installation.ownerId !== userId || !installation.activeAccountId || !installation.oauthClientConfigId) {
    throw new AppError("UNAUTHORIZED", 401, "Log in als eigenaar van deze installatie.");
  }
  return { ...installation, ownerId: userId, activeAccountId: installation.activeAccountId, oauthClientConfigId: installation.oauthClientConfigId };
}

export async function publicInstallation(db: PrismaClient, userId: string) {
  const installation = await ownerInstallation(db, userId);
  const [account, owner, calendar, preferences, attempts, creation] = await Promise.all([
    db.account.findUniqueOrThrow({ where: { id: installation.activeAccountId } }),
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.calendarSettings.findUnique({ where: { userId } }), getPreferences(userId, db),
    db.googleConnectionAttempt.findMany({ where: { ownerId: userId, status: { in: ["pending", "completed"] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }, take: 1, select: { id: true, mode: true, status: true, profileEmail: true } }),
    db.calendarCreationAttempt.findFirst({ where: { ownerId: userId, status: { in: ["sending", "uncertain", "created", "ready"] } }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, timeZone: true, status: true, calendarId: true } }),
  ]);
  return { account: { email: owner.email, name: owner.name }, preferences,
    calendarPermission: hasCalendarScopes(account.scope), canCreateCalendar: !!account.scope?.split(/\s+/).includes(calendarCreationScope),
    needsReauth: account.needsReauth || !account.refresh_token, calendarReady: !!calendar,
    initialCalendarId: installation.initialCalendarId,
    calendar: calendar ? { id: calendar.calendarId, name: calendar.summary, timeZone: calendar.timeZone, confirmedAt: calendar.confirmedAt.toISOString() } : null,
    connectionAttempt: attempts[0] ?? null, calendarCreation: creation };
}
