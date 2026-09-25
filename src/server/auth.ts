import type { NextAuthOptions } from "next-auth";
import { clientSecretOf } from "./credentials";
import type { AdapterAccount } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { cookies } from "next/headers";
import { database } from "./db";
import { config } from "./config";
import { getInstallation } from "./installation";
import { GoogleConnectionService, type GoogleProfile } from "./google-connection";
import { AppError } from "./errors";
import { signInAllowed } from "./user-access";
import { acceptInvitation } from "./invitations";

export const sessionCookieName = () => config().origin.startsWith("https://") ? "__Secure-next-auth.session-token" : "next-auth.session-token";
export async function currentSessionToken() { return (await cookies()).get(sessionCookieName())?.value ?? ""; }
export async function oauthReady() { return !!(await getInstallation())?.oauthClientConfigId; }

export async function authOptions(connection?: { attemptId: string; sessionToken: string }, invitation?: { cookie: string; sessionToken: string }): Promise<NextAuthOptions> {
  const settings = config(), db = database(), installation = await getInstallation(db);
  if (!installation?.oauthClientConfigId) throw new AppError("SETUP_REQUIRED", 503, "Richt eerst de Google-koppeling van deze installatie in.");
  const connections = new GoogleConnectionService(db);
  const attempt = connection ? await connections.validate(connection.attemptId, connection.sessionToken) : null;
  const client = await db.oAuthClientConfig.findUniqueOrThrow({ where: { id: attempt?.oauthClientConfigId ?? installation.oauthClientConfigId } });
  const adapter = PrismaAdapter(db), linkAccount = adapter.linkAccount!;
  // Login never stores Calendar tokens; they are confirmed separately per user.
  adapter.linkAccount = (account: AdapterAccount) => linkAccount({ ...account, access_token: undefined, refresh_token: undefined,
    expires_at: undefined, scope: undefined, id_token: undefined, oauthClientConfigId: client.id } as never);
  // No free registration: a new user is only created through an invitation (P6).
  adapter.createUser = async () => { throw new AppError("NOT_INVITED", 403, "Dit Google-account heeft geen toegang tot deze installatie."); };
  // NextAuth gives callbacks.signIn the raw, OIDC-verified profile; events.signIn
  // receives a normalized profile without email_verified. Keep validation local
  // to this request rather than manufacturing that assertion in the event.
  let verifiedProfile: GoogleProfile | undefined;
  // An invitation is accepted only in a browser without another signed-in user.
  async function acceptFromInvitation(input: { cookie: string; sessionToken: string }, account: Parameters<typeof acceptInvitation>[2], profile: GoogleProfile) {
    if (input.sessionToken) {
      const session = await db.session.findUnique({ where: { sessionToken: input.sessionToken } });
      if (session && session.expires > new Date()) return false;
    }
    try { await acceptInvitation(db, input.cookie, account, profile); return true; } catch { return false; }
  }
  return {
    secret: settings.secret, adapter,
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    providers: [GoogleProvider({ clientId: client.clientId, clientSecret: clientSecretOf(client), checks: ["pkce", "state"],
      authorization: { params: { scope: ["openid", "email", "profile", ...(attempt ? JSON.parse(attempt.requiredScopesJson) as string[] : [])].join(" "),
        access_type: "offline", prompt: attempt ? "consent select_account" : "select_account", include_granted_scopes: "false", response_type: "code" } } })],
    pages: { signIn: "/", error: attempt ? "/settings" : "/" },
    callbacks: {
      async signIn({ account, profile }) {
        const accepted = attempt && connection
          ? await connections.accepts(attempt.id, connection.sessionToken, account, profile as GoogleProfile)
          : invitation ? await acceptFromInvitation(invitation, account, profile as GoogleProfile)
          : await signInAllowed(db, account, profile as GoogleProfile);
        verifiedProfile = accepted ? profile as GoogleProfile : undefined;
        return accepted;
      },
      async session({ session, user }) { session.user = { id: user.id, email: user.email, name: user.name } as typeof session.user; return session; },
    },
    events: {
      async signIn({ user, account }) {
        const current = await db.user.findUnique({ where: { id: user.id }, select: { accessStatus: true } });
        if (current?.accessStatus !== "ACTIVE") throw new AppError("WRONG_GOOGLE_ACCOUNT", 403, "Dit account heeft geen actieve toegang.");
        if (attempt && connection && account) {
          if (!verifiedProfile) throw new AppError("WRONG_GOOGLE_ACCOUNT", 403, "De Google-identiteit kon niet worden bevestigd.");
          await connections.completeLocked(attempt.id, connection.sessionToken, user.id, account, verifiedProfile);
        }
        // Ordinary identity login never overwrites separately confirmed Calendar tokens.
      },
    },
    debug: false,
    logger: {
      error(code) { console.error("when2watch: auth error", code); },
      warn(code) { console.warn("when2watch: auth warning", code); }, debug() {},
    },
  };
}
