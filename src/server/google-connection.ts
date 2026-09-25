import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Account } from "next-auth";
import { getInstallation } from "./installation";
import { connectionAccount } from "./calendar-bindings";
import { accessFor, adminFor } from "./user-access";
import { AppError } from "./errors";
import { serializeCalendarMutation } from "./calendar-mutations";
import { calendarScopes, calendarCreationScope, hasCalendarScopes } from "./auth-policy";
import { googleTokenRefresher } from "./google-tokens";
import { GoogleCalendar } from "./google-calendar";

export const connectionCookie = "when2watch.connection";
export const hashSession = (token: string) => createHash("sha256").update(token).digest("hex");
export type ConnectionMode = "calendar" | "create" | "candidate" | "replace-client";
export type GoogleProfile = { email?: string; email_verified?: boolean; name?: string };
type ConnectionInput = { mode: ConnectionMode; clientId?: string; clientSecret?: string };
const expired = () => new AppError("CONNECTION_EXPIRED", 409, "Deze koppelpoging is verlopen of hoort bij een andere sessie. Start de koppeling opnieuw vanuit Instellingen.");
export type RefreshFactory = typeof googleTokenRefresher;

export class GoogleConnectionService {
  constructor(private readonly db: PrismaClient, private readonly refresh: RefreshFactory = googleTokenRefresher, private readonly fetcher: typeof fetch = fetch) {}

  private async sessionOwner(token: string) {
    const session = await this.db.session.findUnique({ where: { sessionToken: token } });
    if (!session || session.expires <= new Date()) throw expired();
    return session.userId;
  }

  begin(userId: string, sessionToken: string, input: ConnectionInput) {
    return serializeCalendarMutation(userId, async () => {
      await accessFor(this.db, userId);
      if (await this.sessionOwner(sessionToken) !== userId) throw expired();
      if (!input || !["calendar", "create", "candidate", "replace-client"].includes(input.mode)) throw new AppError("INVALID_INPUT", 400, "Kies een geldige Google-actie.");
      // The OAuth client is central installation configuration: only an admin may replace it.
      if (input.mode === "replace-client") await adminFor(this.db, userId);
      const installation = await getInstallation(this.db);
      if (!installation?.oauthClientConfigId) throw new AppError("SETUP_REQUIRED", 503, "Richt eerst de Google-koppeling van deze installatie in.");
      let clientId = installation.oauthClientConfigId;
      const account = await connectionAccount(this.db, userId);
      const required = input.mode === "replace-client"
        ? [...calendarScopes, calendarCreationScope].filter(scope => account?.scope?.split(/\s+/).includes(scope))
        : [...calendarScopes, ...(input.mode === "create" ? [calendarCreationScope] : [])];
      return this.db.$transaction(async tx => {
        if (input.mode === "replace-client") {
          if (typeof input.clientId !== "string" || !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(input.clientId) ||
              typeof input.clientSecret !== "string" || !input.clientSecret.trim() || input.clientSecret.length > 1000) {
            throw new AppError("INVALID_INPUT", 400, "Gebruik de client-ID en het secret van een Google OAuth-webclient.");
          }
          const current = await tx.oAuthClientConfig.findUniqueOrThrow({ where: { id: clientId } });
          if (current.clientId === input.clientId) throw new AppError("SAME_OAUTH_CLIENT", 409, "Dit is de huidige client. Kies een andere OAuth-webclient.");
          clientId = (await tx.oAuthClientConfig.create({ data: { clientId: input.clientId, clientSecret: input.clientSecret.trim() } })).id;
        }
        await tx.googleConnectionAttempt.updateMany({ where: { ownerId: userId, status: { in: ["pending", "completed", "ready"] } }, data: { status: "cancelled", tokensJson: null } });
        return tx.googleConnectionAttempt.create({ data: { id: randomBytes(24).toString("hex"), ownerId: userId,
          sessionHash: hashSession(sessionToken), mode: input.mode, requiredScopesJson: JSON.stringify(required),
          oauthClientConfigId: clientId, expiresAt: new Date(Date.now() + 15 * 60_000) } });
      });
    });
  }

  async validate(id: string, sessionToken: string, status: string | string[] = "pending") {
    const attempt = await this.db.googleConnectionAttempt.findUnique({ where: { id } });
    if (!attempt || !(Array.isArray(status) ? status : [status]).includes(attempt.status) || attempt.expiresAt <= new Date() || attempt.sessionHash !== hashSession(sessionToken) ||
        !attempt.ownerId || await this.sessionOwner(sessionToken) !== attempt.ownerId) throw expired();
    await accessFor(this.db, attempt.ownerId);
    return attempt;
  }

  async accepts(id: string, sessionToken: string, account: Account | null, profile: GoogleProfile | undefined) {
    const attempt = await this.validate(id, sessionToken);
    if (account?.provider !== "google" || !account.providerAccountId || !profile?.email || profile.email_verified !== true) return false;
    // A Google identity that already belongs to another user is never linked here.
    const linked = await this.db.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } } });
    if (linked && linked.userId !== attempt.ownerId) return false;
    if (attempt.mode === "candidate") return true;
    const current = await connectionAccount(this.db, attempt.ownerId!);
    // Reconnect keeps the chosen account; a first connection uses the user's own login identity.
    return current ? current.providerAccountId === account.providerAccountId : !!linked;
  }

  complete(id: string, sessionToken: string, userId: string, account: Account, profile: GoogleProfile) {
    return serializeCalendarMutation(userId, () => this.completeLocked(id, sessionToken, userId, account, profile));
  }

  // The NextAuth route holds the same owner lock across adapter work and callback.
  async completeLocked(id: string, sessionToken: string, userId: string, account: Account, profile: GoogleProfile) {
    if (!await this.accepts(id, sessionToken, account, profile)) throw new AppError("WRONG_GOOGLE_ACCOUNT", 403, "Gebruik het account dat bij deze koppelpoging hoort.");
    const attempt = await this.validate(id, sessionToken);
    if (attempt.ownerId !== userId) throw expired();
    const linked = await this.db.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } } });
    if (!linked || linked.userId !== userId) throw new AppError("WRONG_GOOGLE_ACCOUNT", 403, "Deze Google-identiteit hoort niet bij de bestaande eigenaar.");
    const tokens = { access_token: account.access_token, expires_at: account.expires_at, scope: account.scope, token_type: account.token_type,
      refresh_token: account.refresh_token || (linked.oauthClientConfigId === attempt.oauthClientConfigId ? linked.refresh_token : undefined) };
    await this.db.googleConnectionAttempt.update({ where: { id }, data: { status: "completed", accountId: linked.id,
      providerAccountId: account.providerAccountId, profileEmail: profile.email, profileName: profile.name, tokensJson: JSON.stringify(tokens) } });
  }

  cancel(id: string, sessionToken: string) {
    return this.validate(id, sessionToken, ["pending", "completed", "ready"]).then(attempt => serializeCalendarMutation(attempt.ownerId!, () => this.cancelLocked(id, sessionToken, ["pending", "completed", "ready"])));
  }

  async cancelLocked(id: string, sessionToken: string, statuses = ["pending"]) {
    const attempt = await this.validate(id, sessionToken, statuses);
    await this.db.googleConnectionAttempt.update({ where: { id: attempt.id }, data: { status: "cancelled", tokensJson: null } });
  }

  confirm(userId: string, sessionToken: string, id: string) {
    return serializeCalendarMutation(userId, async () => {
      const attempt = await this.validate(id, sessionToken, "completed"), current = await connectionAccount(this.db, userId);
      if (attempt.ownerId !== userId || !attempt.accountId || !attempt.tokensJson) throw expired();
      const tokens = JSON.parse(attempt.tokensJson) as Account;
      const required = JSON.parse(attempt.requiredScopesJson) as string[];
      if (!required.every(scope => tokens.scope?.split(/\s+/).includes(scope))) throw new AppError("CALENDAR_PERMISSION_REQUIRED", 409, "Niet alle gevraagde agendarechten zijn verleend. Verbind opnieuw en selecteer de benodigde toestemmingen.");
      if (!tokens.refresh_token) throw new AppError("RECONNECT_GOOGLE", 409, "De blijvende Google-toegang ontbreekt. Verbind opnieuw voordat je deze keuze bevestigt.");
      const client = await this.db.oAuthClientConfig.findUniqueOrThrow({ where: { id: attempt.oauthClientConfigId } });
      let refreshed: Awaited<ReturnType<ReturnType<RefreshFactory>>>;
      try { refreshed = await this.refresh(client.clientId, client.clientSecret)(tokens.refresh_token); }
      catch { throw new AppError("RECONNECT_GOOGLE", 409, "De nieuwe Google-verbinding kon niet blijvend worden bevestigd. De bestaande verbinding is behouden."); }
      if (!refreshed.access_token || !refreshed.expiry_date) throw new AppError("RECONNECT_GOOGLE", 409, "Google gaf geen bruikbare blijvende toegang.");
      if (hasCalendarScopes(tokens.scope)) await new GoogleCalendar(async () => refreshed.access_token!, this.fetcher).calendars();
      await this.db.$transaction(async tx => {
        await tx.account.update({ where: { id: attempt.accountId! }, data: { oauthClientConfigId: attempt.oauthClientConfigId,
          access_token: refreshed.access_token, refresh_token: refreshed.refresh_token || tokens.refresh_token, expires_at: Math.floor(refreshed.expiry_date! / 1000),
          scope: tokens.scope, token_type: tokens.token_type, needsReauth: false, profileEmail: attempt.profileEmail, profileName: attempt.profileName } });
        if (attempt.mode !== "candidate") {
          if (current && attempt.accountId !== current.id) throw expired();
          await tx.userConnection.upsert({ where: { userId }, create: { userId, accountId: attempt.accountId! }, update: { accountId: attempt.accountId! } });
          if (attempt.mode === "replace-client") {
            await adminFor(this.db, userId);
            await tx.installation.update({ where: { id: "singleton" }, data: { oauthClientConfigId: attempt.oauthClientConfigId } });
          }
          // The login identity (User.email) stays as Google reported it at sign-in; the Calendar
          // account's profile lives on the Account row.
        }
        await tx.googleConnectionAttempt.update({ where: { id }, data: { status: attempt.mode === "candidate" ? "ready" : "confirmed", tokensJson: null } });
      });
      return { confirmed: true };
    });
  }
}
