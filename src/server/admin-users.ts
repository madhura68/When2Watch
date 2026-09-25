import type { PrismaClient } from "@prisma/client";
import { AppError } from "./errors";
import { audit } from "./audit";
import { adminFor } from "./user-access";
import { serializeCalendarMutation } from "./calendar-mutations";

/** Access data only: no follows, calendars or tokens of other users. */
export async function listUsers(db: PrismaClient, adminId: string) {
  await adminFor(db, adminId);
  return db.user.findMany({ orderBy: [{ email: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true, role: true, accessStatus: true } });
}

/** Runs under the target user's mutation lock, so an in-flight Calendar action finishes before access ends. */
export async function blockUser(db: PrismaClient, adminId: string, userId: string) {
  await adminFor(db, adminId);
  return serializeCalendarMutation(userId, () => db.$transaction(async tx => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) throw new AppError("NOT_FOUND", 404, "Deze gebruiker bestaat niet.");
    if (target.role === "ADMIN" && target.accessStatus === "ACTIVE" && await tx.user.count({ where: { role: "ADMIN", accessStatus: "ACTIVE" } }) <= 1) {
      throw new AppError("LAST_ADMIN", 409, "De laatste actieve beheerder kan niet worden geblokkeerd.");
    }
    await tx.user.update({ where: { id: userId }, data: { accessStatus: "BLOCKED" } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.googleConnectionAttempt.updateMany({ where: { ownerId: userId, status: { in: ["pending", "completed", "ready"] } }, data: { status: "cancelled", tokensJson: null } });
    await audit(tx, "user.blocked", adminId, userId);
    return { blocked: true };
  }, { isolationLevel: "Serializable" }));
}

export async function reactivateUser(db: PrismaClient, adminId: string, userId: string) {
  await adminFor(db, adminId);
  return serializeCalendarMutation(userId, () => db.$transaction(async tx => {
    // A user whose own deletion is pending never returns.
    if (await tx.deletionTombstone.count({ where: { userId } })) throw new AppError("NOT_BLOCKED", 409, "Dit account wordt verwijderd en kan niet worden heractiveerd.");
    // Only a blocked user returns; an old UNCLAIMED profile needs an invitation.
    const updated = await tx.user.updateMany({ where: { id: userId, accessStatus: "BLOCKED" }, data: { accessStatus: "ACTIVE" } });
    if (!updated.count) throw new AppError("NOT_BLOCKED", 409, "Alleen een geblokkeerde gebruiker kan worden heractiveerd.");
    await audit(tx, "user.reactivated", adminId, userId);
    return { reactivated: true };
  }));
}
