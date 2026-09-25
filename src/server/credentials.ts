import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "./errors";

/**
 * Authenticated encryption (AES-256-GCM) for stored secrets: OAuth tokens, the OAuth client secret and
 * pending connection tokens. Keys live outside the database in W2W_CREDENTIAL_KEYS ("id:base64,…"; the
 * first key seals, all keys open). The AAD binds a ciphertext to its record and field, so a value copied
 * to another row or column does not open. There is no plaintext fallback.
 */
export type SecretField = "account.access_token" | "account.refresh_token" | "oauthClient.clientSecret" | "connectionAttempt.tokens";
const prefix = "w2w:v1";
const unavailable = () => new AppError("CREDENTIALS_UNAVAILABLE", 503, "De sleutel voor opgeslagen Google-toegang ontbreekt of klopt niet. Neem contact op met de beheerder.");

function keys(source = process.env.W2W_CREDENTIAL_KEYS) {
  const parsed = (source ?? "").split(",").map(s => s.trim()).filter(Boolean).map(entry => {
    const [id, value] = entry.split(":");
    const key = Buffer.from(value ?? "", "base64");
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id ?? "") || key.length !== 32) throw unavailable();
    return { id, key };
  });
  if (!parsed.length) throw unavailable();
  return parsed;
}

const aad = (field: SecretField, recordId: string) => Buffer.from(`${field}:${recordId}`);
export const isSealed = (value: string | null | undefined) => typeof value === "string" && value.startsWith(`${prefix}:`);

export function seal(value: string, field: SecretField, recordId: string, keySource?: string) {
  const { id, key } = keys(keySource)[0], iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(field, recordId));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [prefix, id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(":");
}

export function open(envelope: string, field: SecretField, recordId: string, keySource?: string) {
  const parts = envelope.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== prefix) throw unavailable();
  const key = keys(keySource).find(k => k.id === parts[2]);
  if (!key) throw unavailable();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.key, Buffer.from(parts[3], "base64url"));
    decipher.setAAD(aad(field, recordId)); decipher.setAuthTag(Buffer.from(parts[4], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[5], "base64url")), decipher.final()]).toString("utf8");
  } catch { throw unavailable(); }
}

export const sealOptional = (value: string | null | undefined, field: SecretField, recordId: string) => value ? seal(value, field, recordId) : value;
export const openOptional = (value: string | null | undefined, field: SecretField, recordId: string) => value ? open(value, field, recordId) : value;

/** Data for a new OAuthClientConfig row; the id is fixed up front because it is part of the AAD. */
export function sealedClient(clientId: string, clientSecret: string) {
  const id = randomUUID();
  return { id, clientId, clientSecret: seal(clientSecret, "oauthClient.clientSecret", id) };
}
export const clientSecretOf = (client: { id: string; clientSecret: string }) => open(client.clientSecret, "oauthClient.clientSecret", client.id);
