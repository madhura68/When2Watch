import type { PrismaClient, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { database } from "./db";
import { AppError } from "./errors";

export type AccessUser = { id: string; email: string | null; role: Role };
const unauthorized = () => new AppError("UNAUTHORIZED", 401, "Log eerst in met een toegelaten account.");

/** Access is decided by the current database state, never by what the session remembers. */
export async function accessFor(db: PrismaClient, userId: string | null | undefined): Promise<AccessUser> {
  if (!userId) throw unauthorized();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, accessStatus: true } });
  if (!user || user.accessStatus !== "ACTIVE") throw unauthorized();
  return { id: user.id, email: user.email, role: user.role };
}

export async function adminFor(db: PrismaClient, userId: string | null | undefined): Promise<AccessUser> {
  const user = await accessFor(db, userId);
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Alleen een beheerder kan dit doen.");
  return user;
}

/** Login identity: a verified Google subject that already belongs to an ACTIVE user. No merge on email. */
export async function signInAllowed(db: PrismaClient, account: { provider?: string; providerAccountId?: string } | null,
  profile: { email?: string; email_verified?: boolean } | undefined): Promise<boolean> {
  if (account?.provider !== "google" || !account.providerAccountId || profile?.email_verified !== true || !profile.email?.trim()) return false;
  const linked = await db.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
    select: { user: { select: { accessStatus: true } } } });
  return linked?.user.accessStatus === "ACTIVE";
}

async function sessionUserId() {
  const { authOptions } = await import("./auth");
  const session = await getServerSession(await authOptions());
  return (session?.user as { id?: string } | undefined)?.id;
}

export async function currentUser(): Promise<AccessUser | null> {
  try { return await accessFor(database(), await sessionUserId()); }
  catch (error) { if (error instanceof AppError && error.status === 401) return null; throw error; }
}
export async function requireUser(): Promise<AccessUser> { return accessFor(database(), await sessionUserId()); }
export async function requireAdmin(): Promise<AccessUser> { return adminFor(database(), await sessionUserId()); }
