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
