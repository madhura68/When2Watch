import type { PrismaClient } from "@prisma/client";
import type { Account } from "next-auth";
import { OAuth2Client } from "google-auth-library";
import { AppError } from "./errors";
import { hasCalendarScopes } from "./auth-policy";

type Refresher = (refreshToken: string) => Promise<{ access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }>;

export async function saveGoogleTokens(db: PrismaClient, accountId: string, oauthClientConfigId: string, account: Account): Promise<void> {
  if (account.provider !== "google") throw new AppError("INVALID_PROVIDER", 403, "Gebruik Google om te koppelen.");
  const current = await db.account.findUnique({ where: { id: accountId } });
  if (!current || current.provider !== "google" || current.providerAccountId !== account.providerAccountId) throw new AppError("ACCOUNT_NOT_FOUND", 401, "Koppel je Google-account opnieuw.");
  if (current.oauthClientConfigId !== oauthClientConfigId && !account.refresh_token) throw new AppError("RECONNECT_GOOGLE", 401, "De nieuwe client heeft eigen blijvende Google-toegang nodig.");
  await db.account.update({
    where: { id: accountId },
    data: {
      oauthClientConfigId,
      access_token: account.access_token,
      refresh_token: account.refresh_token || undefined,
      expires_at: account.expires_at,
      scope: account.scope,
      token_type: account.token_type,
      needsReauth: false,
    },
  });
}

export async function getGoogleAccessToken(db: PrismaClient, accountId: string, refreshFactory: typeof googleTokenRefresher = googleTokenRefresher, forceRefresh = false): Promise<string> {
  const account = await db.account.findUnique({ where: { id: accountId }, include: { oauthClient: true } });
  const reconnect = () => new AppError("RECONNECT_GOOGLE", 401, "Koppel Google opnieuw en geef beide agendatoestemmingen.");
  if (!account || account.provider !== "google" || !account.oauthClient || account.needsReauth || !hasCalendarScopes(account.scope)) throw reconnect();
  if (!forceRefresh && account.access_token && (account.expires_at ?? 0) > Date.now() / 1000 + 60) return account.access_token;
  if (!account.refresh_token) throw reconnect();

  let tokens: Awaited<ReturnType<Refresher>>;
  try {
    tokens = await refreshFactory(account.oauthClient.clientId, account.oauthClient.clientSecret)(account.refresh_token);
  } catch (error) {
    const reason = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
    if (reason === "invalid_grant") {
      await db.account.update({ where: { id: account.id }, data: { needsReauth: true } });
      throw reconnect();
    }
    throw new AppError("GOOGLE_UNAVAILABLE", 503, "Google is tijdelijk niet bereikbaar. Probeer het opnieuw.");
  }
  if (!tokens.access_token || !tokens.expiry_date) throw reconnect();
  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      expires_at: Math.floor(tokens.expiry_date / 1000),
    },
  });
  return tokens.access_token;
}

export function googleTokenRefresher(clientId: string, clientSecret: string): Refresher {
  return async (refreshToken) => {
    const client = new OAuth2Client({ clientId, clientSecret });
    client.setCredentials({ refresh_token: refreshToken });
    const result = await client.refreshAccessToken();
    return result.credentials;
  };
}
