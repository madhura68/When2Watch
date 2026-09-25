// IDEA-219 R2 cutover step: seals every stored secret with the credential key (AES-256-GCM).
// Runs once in one transaction before the R2 app starts; idempotent; prints counts only, never values.
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import { isSealed, open, seal, type SecretField } from "../../src/server/credentials";
import { safeError } from "./manifest";

export async function encryptCredentials(db: PrismaClient) {
  return db.$transaction(async tx => {
    const counts = { accountTokens: 0, clientSecrets: 0, attemptTokens: 0, alreadySealed: 0 };
    // Seal and prove the round trip in memory before anything is written.
    const convert = (value: string | null, field: SecretField, id: string) => {
      if (!value) return undefined;
      if (isSealed(value)) { open(value, field, id); counts.alreadySealed++; return undefined; }
      const sealed = seal(value, field, id);
      if (open(sealed, field, id) !== value) throw Error(`Round trip failed for ${field}.`);
      return sealed;
    };
    for (const account of await tx.account.findMany({ select: { id: true, access_token: true, refresh_token: true } })) {
      const data: Prisma.AccountUpdateInput = { access_token: convert(account.access_token, "account.access_token", account.id),
        refresh_token: convert(account.refresh_token, "account.refresh_token", account.id) };
      if (data.access_token || data.refresh_token) { await tx.account.update({ where: { id: account.id }, data }); counts.accountTokens++; }
    }
    for (const client of await tx.oAuthClientConfig.findMany({ select: { id: true, clientSecret: true } })) {
      const clientSecret = convert(client.clientSecret, "oauthClient.clientSecret", client.id);
      if (clientSecret) { await tx.oAuthClientConfig.update({ where: { id: client.id }, data: { clientSecret } }); counts.clientSecrets++; }
    }
    for (const attempt of await tx.googleConnectionAttempt.findMany({ where: { tokensJson: { not: null } }, select: { id: true, tokensJson: true } })) {
      const tokensJson = convert(attempt.tokensJson, "connectionAttempt.tokens", attempt.id);
      if (tokensJson) { await tx.googleConnectionAttempt.update({ where: { id: attempt.id }, data: { tokensJson } }); counts.attemptTokens++; }
    }
    return counts;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  encryptCredentials(db).then(counts => console.log(JSON.stringify({ status: "SEALED", counts })))
    .catch(error => { console.error(safeError(error)); process.exitCode = 1; }).finally(() => db.$disconnect());
}
