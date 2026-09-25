import type { Account, CalendarBinding, Prisma, PrismaClient } from "@prisma/client";
import type { CalendarInfo } from "./google-calendar";
import { hasCalendarScopes } from "./auth-policy";

type Db = PrismaClient | Prisma.TransactionClient;
export type ActiveBinding = { binding: CalendarBinding; account: Account } | { unconfigured: true };

/** The user's own active calendar with its account; the composite FK guarantees the account is the user's. */
export async function getActiveBinding(db: Db, userId: string): Promise<ActiveBinding> {
  const binding = await db.calendarBinding.findFirst({ where: { userId, status: "ACTIVE" }, include: { account: true } });
  if (!binding?.account || binding.account.userId !== userId) return { unconfigured: true };
  const { account, ...rest } = binding;
  return { binding: rest, account };
}

/** The Google account this user chose for Calendar (UserConnection), if any. */
export async function connectionAccount(db: Db, userId: string): Promise<Account | null> {
  const connection = await db.userConnection.findUnique({ where: { userId }, include: { account: true } });
  return connection && connection.account.userId === userId ? connection.account : null;
}

export function bindingMetadata(calendar: CalendarInfo, now = new Date()) {
  return { summary: calendar.summary, timeZone: calendar.timeZone, accessRole: calendar.accessRole,
    defaultRemindersJson: JSON.stringify(calendar.defaultReminders), confirmedAt: now };
}

/**
 * Whether When2Watch may write to this binding with narrow grants: only a calendar the app provably created,
 * through an account that effectively holds calendarlist.readonly + app.created. Otherwise sync is paused.
 */
export function bindingUsable(binding: Pick<CalendarBinding, "provenance">, account: Pick<Account, "scope" | "needsReauth" | "refresh_token">): "ok" | "legacy" | "permission" {
  if (binding.provenance !== "APP_CREATED") return "legacy";
  if (!hasCalendarScopes(account.scope) || account.needsReauth || !account.refresh_token) return "permission";
  return "ok";
}
