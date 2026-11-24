import { createModels, type Credential, type CredentialInfo, type CredentialStore, type Models } from "@earendil-works/pi-ai";
import type { Vault } from "./vault.js";

const PROVIDER_SECRET_KEYS: Record<string, string> = {
  openai: "openai_api_key",
  anthropic: "anthropic_api_key",
  google: "google_api_key",
  openrouter: "openrouter_api_key",
  xai: "xai_api_key"
};

export function createVaultCredentialStore(vault: Vault): CredentialStore {
  const keyFor = (providerId: string) => PROVIDER_SECRET_KEYS[providerId] ?? `${providerId}_api_key`;

  return {
    async read(providerId: string): Promise<Credential | undefined> {
      const apiKey = await vault.resolve(keyFor(providerId));
      if (!apiKey) return undefined;
      return { type: "api_key", key: apiKey };
    },
    async list(): Promise<readonly CredentialInfo[]> {
      const metas = vault.listMeta();
      const out: CredentialInfo[] = [];
      for (const [providerId, secretName] of Object.entries(PROVIDER_SECRET_KEYS)) {
        if (metas.some((m) => m.name === secretName)) {
          out.push({ providerId, type: "api_key" });
        }
      }
      return out;
    },
    async modify(
      providerId: string,
      fn: (current: Credential | undefined) => Promise<Credential | undefined>
    ): Promise<Credential | undefined> {
      const current = await this.read(providerId);
      const next = await fn(current);
      if (next && next.type === "api_key" && typeof next.key === "string") {
        await vault.set(keyFor(providerId), next.key, `${providerId} API key`, "llm");
      }
      return next;
    },
    async delete(providerId: string): Promise<void> {
      vault.delete(keyFor(providerId));
    }
  };
}

export function buildModels(vault: Vault): Models {
  return createModels({
    credentials: createVaultCredentialStore(vault)
  });
}
