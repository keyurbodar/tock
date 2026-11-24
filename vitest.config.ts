import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          VAULT_MASTER_KEY: "test-master-key-32-bytes-minimum-1234",
          DEV_ALLOW_ANON: "1"
        }
      }
    })
  ]
});
