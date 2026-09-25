import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "./errors";
import { audit } from "./audit";
import { adminFor } from "./user-access";

export const invitationCookie = "when2watch.invitation";
const validity = 72 * 3600_000, flowValidity = 15 * 60_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const invalid = () => new AppError("INVITATION_INVALID", 400, "Deze uitnodiging is niet (meer) geldig. Vraag de beheerder om een nieuwe link.");

/** Trim and lowercase only: Gmail dots and plus tags are different addresses here. */
export function normalizeEmail(email: unknown) {
  const value = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || value.length > 254) throw new AppError("INVALID_INPUT", 400, "Vul een geldig e-mailadres in.");
  return value;
}

export async function createInvitation(db: PrismaClient, adminId: string, email: unknown, now = new Date()) {
  await adminFor(db, adminId);
  const address = normalizeEmail(email), token = randomBytes(32).toString("base64url");
  const invitation = await db.$transaction(async tx => {
    // A new invitation replaces any open one for the same address.
    await tx.invitation.updateMany({ where: { email: address, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const created = await tx.invitation.create({ data: { email: address, tokenHash: hash(token), expiresAt: new Date(+now + validity), invitedById: adminId } });
    await audit(tx, "invitation.created", adminId, created.id);
    return created;
  });
  // The token travels in the fragment, which browsers never send to the server.
  return { invitation, token, path: `/uitnodiging#token=${token}` };
}

export async function revokeInvitation(db: PrismaClient, adminId: string, invitationId: string) {
  await adminFor(db, adminId);
  const revoked = await db.invitation.updateMany({ where: { id: invitationId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (revoked.count) await audit(db, "invitation.revoked", adminId, invitationId);
  return { revoked: revoked.count === 1 };
}

export async function listInvitations(db: PrismaClient, adminId: string, now = new Date()) {
  await adminFor(db, adminId);
  const rows = await db.invitation.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, email: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true } });
  return rows.map(row => ({ id: row.id, email: row.email, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    status: row.acceptedAt ? "accepted" : row.revokedAt ? "revoked" : row.expiresAt <= now ? "expired" : "open" }));
}

/** Link token → short-lived browser flow. Nothing is claimed yet. */
export async function exchangeInvitation(db: PrismaClient, token: unknown, now = new Date()) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hash(token) } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now) throw invalid();
  const flowId = randomBytes(16).toString("hex"), secret = randomBytes(32).toString("base64url");
  await db.invitationFlow.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.invitationFlow.create({ data: { id: flowId, invitationId: invitation.id, browserSecretHash: hash(secret), expiresAt: new Date(+now + flowValidity) } });
  return { flowId, secret };
}
export const invitationCookieValue = (flow: { flowId: string; secret: string }) => `${flow.flowId}.${flow.secret}`;

type GoogleAccount = { provider?: string; providerAccountId?: string } | null;
type VerifiedProfile = { email?: string; email_verified?: boolean; name?: string } | undefined;

/**
 * Runs inside NextAuth callbacks.signIn, before the adapter's login handling: one transaction claims the
 * invitation, creates or activates the user and links the Google identity. NextAuth then finds the linked
 * identity and only creates the session. No network inside the transaction.
 */
export async function acceptInvitation(db: PrismaClient, cookie: string, account: GoogleAccount, profile: VerifiedProfile, now = new Date()) {
  const [flowId, secret] = cookie.split(".");
  if (!flowId || !secret || account?.provider !== "google" || !account.providerAccountId || profile?.email_verified !== true) throw invalid();
  const email = (profile.email ?? "").trim().toLowerCase(), subject = account.providerAccountId;
  try {
    return await db.$transaction(async tx => {
      const flow = await tx.invitationFlow.findUnique({ where: { id: flowId }, include: { invitation: true } });
      if (!flow || flow.expiresAt <= now || flow.browserSecretHash !== hash(secret)) throw invalid();
      const invitation = flow.invitation;
      if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now || invitation.email !== email) throw invalid();
      // Identity comes only from the provider-subject mapping, never from the OAuth profile's user id.
      const linked = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: subject } }, include: { user: true } });
      let userId: string;
      if (linked) {
        if (linked.user.accessStatus === "BLOCKED" || linked.user.email?.trim().toLowerCase() !== email) throw invalid();
        userId = linked.user.id;
        if (linked.user.accessStatus !== "ACTIVE") await tx.user.update({ where: { id: userId }, data: { accessStatus: "ACTIVE" } });
      } else {
        // No merge on an e-mail address: an existing user with this address but another identity is refused.
        if (await tx.user.findUnique({ where: { email } })) throw invalid();
        const user = await tx.user.create({ data: { email, name: profile.name ?? null, emailVerified: now, role: "USER", accessStatus: "ACTIVE" } });
        await tx.account.create({ data: { userId: user.id, type: "oauth", provider: "google", providerAccountId: subject } });
        userId = user.id;
      }
      const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now } });
      if (claimed.count !== 1) throw invalid();
      await tx.invitationFlow.deleteMany({ where: { invitationId: invitation.id } });
      await audit(tx, "invitation.accepted", userId, invitation.id);
      return { userId };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // Races, conflicts and every refusal look the same to the browser.
    if (error instanceof AppError) throw error;
    throw invalid();
  }
}
