import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], globalSetup: ["tests/global-setup.ts"],
    // Synthetic test-only credential key (32 zero bytes); never a production key.
    env: { W2W_CREDENTIAL_KEYS: `test:${Buffer.alloc(32).toString("base64")}` } },
});
