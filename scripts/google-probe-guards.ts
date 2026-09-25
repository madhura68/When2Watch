type AttemptBinding = { id: string; expires: number; completed?: boolean; sessionHash: string | null };

export function probeAttemptReady(attempt: AttemptBinding | undefined, cookie: string | undefined, sessionHash: string | null, ownerExists: boolean, now = Date.now()) {
  if (!attempt || attempt.completed || attempt.expires <= now || cookie !== attempt.id) return false;
  return attempt.sessionHash === null ? !ownerExists : sessionHash === attempt.sessionHash;
}

// Diagnostic categories only: OAuth errors can contain tokens and request data.
export function probeAuthFailure(metadata: unknown): string {
  const value = metadata as {error?: {message?: unknown}; message?: unknown} | null;
  const message = value?.error?.message ?? value?.message;
  if (typeof message !== "string") return "unknown";
  const reasons: [RegExp,string][] = [
    [/State cookie was missing/,"missing_state_cookie"], [/PKCE code_verifier cookie was missing/,"missing_pkce_cookie"],
    [/state mismatch/i,"state_mismatch"], [/redirect_uri_mismatch/,"redirect_uri_mismatch"],
    [/invalid_client/,"invalid_client"], [/invalid_grant/,"invalid_grant"], [/access_denied/,"access_denied"],
    [/JWTExpired|JWT expired|exp.*claim.*failed/i,"expired_cookie"], [/timed out|ETIMEDOUT/i,"provider_timeout"],
  ];
  return reasons.find(([pattern])=>pattern.test(message))?.[1] ?? "unknown";
}

// Operator probes write only to an explicit, separately provisioned PostgreSQL database.
export function isolatedProbeDatabase(raw: string | undefined, productionRaw: string | undefined): string {
  if (!raw) throw Error("Set an explicit PostgreSQL probe database URL.");
  const url = new URL(raw);
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw Error("The probe database must be PostgreSQL.");
  if (productionRaw) {
    const production = new URL(productionRaw);
    if (production.hostname === url.hostname && (production.port || "5432") === (url.port || "5432") && production.pathname === url.pathname) {
      throw Error("Refusing the production database as probe database.");
    }
  }
  if (!/(probe|trial)/.test(url.pathname.slice(1))) throw Error("The probe database name must contain probe or trial.");
  return raw;
}
