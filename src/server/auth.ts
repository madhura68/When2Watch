import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { database } from "./db";
import { config, oauthReady } from "./config";
import { calendarScopes, isAllowedGoogleSignIn, requireIdentity } from "./auth-policy";
import { saveGoogleTokens } from "./google-tokens";
import { AppError } from "./errors";

export function authOptions(): NextAuthOptions {
  const settings = config();
  const db = database();
  return {
    secret: settings.secret,
    adapter: PrismaAdapter(db),
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    providers: [GoogleProvider({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      checks: ["pkce", "state"],
      authorization: {
        params: { scope: ["openid", "email", "profile", ...calendarScopes].join(" "), access_type: "offline", prompt: "consent", response_type: "code" },
      },
    })],
    pages: { signIn: "/", error: "/" },
    callbacks: {
      async signIn({ account, profile }) {
        console.info("when2watch: oauth account field types", Object.entries(account ?? {}).map(([key, value]) => `${key}:${typeof value}`).sort().join(","));
        return isAllowedGoogleSignIn(account, profile, settings.allowedEmail);
      },
      async session({ session, user }) {
        session.user = { id: user.id, email: user.email, name: user.name };
        return session;
      },
    },
    events: {
      async signIn({ user, account }) {
        if (account) await saveGoogleTokens(db, user.id, account);
      },
    },
    debug: false,
    logger: {
      error(code) { console.error("when2watch: auth error", code); },
      warn(code) { console.warn("when2watch: auth warning", code); },
      debug() {},
    },
  };
}

export async function signedInUser() {
  if (!oauthReady()) return null;
  const session = await getServerSession(authOptions());
  try { return requireIdentity(session, config().allowedEmail); }
  catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") return null;
    throw error;
  }
}

export async function requireUser() {
  const user = await signedInUser();
  if (!user) throw new AppError("UNAUTHORIZED", 401, "Log eerst in met het toegelaten Google-account.");
  return user;
}
