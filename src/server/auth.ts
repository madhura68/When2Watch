import { getServerSession, type NextAuthOptions } from "next-auth";
import type { AdapterAccount } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { cookies } from "next/headers";
import { database } from "./db";
import { config } from "./config";
import { getInstallation } from "./installation";
import { isAllowedGoogleSignIn, requireIdentity } from "./auth-policy";
import { GoogleConnectionService, type GoogleProfile } from "./google-connection";
import { AppError } from "./errors";

export const sessionCookieName = () => config().origin.startsWith("https://") ? "__Secure-next-auth.session-token" : "next-auth.session-token";
export async function currentSessionToken() { return (await cookies()).get(sessionCookieName())?.value ?? ""; }
export async function oauthReady() { return !!(await getInstallation())?.oauthClientConfigId; }

export async function authOptions(connection?: { attemptId: string; sessionToken: string }): Promise<NextAuthOptions> {
  const settings = config(), db = database(), installation = await getInstallation(db);
  if (!installation?.ownerId || !installation.activeAccountId || !installation.oauthClientConfigId) {
    throw new AppError("SETUP_REQUIRED", 503, "Richt eerst de eigenaar van deze installatie in.");
  }
  const connections = new GoogleConnectionService(db);
  const attempt = connection ? await connections.validate(connection.attemptId, connection.sessionToken) : null;
  const client = await db.oAuthClientConfig.findUniqueOrThrow({ where: { id: attempt?.oauthClientConfigId ?? installation.oauthClientConfigId } });
  const active = await db.account.findUniqueOrThrow({ where: { id: installation.activeAccountId } });
  if (active.userId !== installation.ownerId) throw new AppError("INSTALLATION_AMBIGUOUS", 503, "De opgeslagen Google-identiteit hoort niet bij de installatie-eigenaar.");
  const adapter = PrismaAdapter(db), linkAccount = adapter.linkAccount!;
  adapter.linkAccount = (account: AdapterAccount) => linkAccount({ ...account, access_token: undefined, refresh_token: undefined,
    expires_at: undefined, scope: undefined, id_token: undefined, oauthClientConfigId: client.id } as never);
  // NextAuth gives callbacks.signIn the raw, OIDC-verified profile; events.signIn
  // receives a normalized profile without email_verified. Keep validation local
  // to this request rather than manufacturing that assertion in the event.
  let verifiedProfile: GoogleProfile | undefined;
  return {
    secret: settings.secret, adapter,
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    providers: [GoogleProvider({ clientId: client.clientId, clientSecret: client.clientSecret, checks: ["pkce", "state"],
      authorization: { params: { scope: ["openid", "email", "profile", ...(attempt ? JSON.parse(attempt.requiredScopesJson) as string[] : [])].join(" "),
        access_type: "offline", prompt: attempt ? "consent select_account" : "select_account", include_granted_scopes: "true", response_type: "code" } } })],
    pages: { signIn: "/", error: attempt ? "/settings" : "/" },
    callbacks: {
      async signIn({ account, profile }) {
        const accepted = attempt && connection
          ? await connections.accepts(attempt.id, connection.sessionToken, account, profile as GoogleProfile)
          : isAllowedGoogleSignIn(account, profile as GoogleProfile, active.providerAccountId);
        verifiedProfile = accepted ? profile as GoogleProfile : undefined;
        return accepted;
      },
      async session({ session, user }) { session.user = { id: user.id, email: user.email, name: user.name }; return session; },
    },
    events: {
      async signIn({ user, account }) {
        if (user.id !== installation.ownerId) throw new AppError("WRONG_GOOGLE_ACCOUNT", 403, "De interne eigenaar kon niet worden behouden.");
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

export async function signedInUser() {
  const installation = await getInstallation();
  if (!installation?.ownerId || !installation.activeAccountId) return null;
  const session = await getServerSession(await authOptions());
  try { return requireIdentity(session, installation.ownerId); }
  catch (error) { if (error instanceof AppError && error.code === "UNAUTHORIZED") return null; throw error; }
}

export async function requireUser() {
  const user = await signedInUser();
  if (!user) throw new AppError("UNAUTHORIZED", 401, "Log eerst in als eigenaar van deze installatie.");
  return user;
}
