import type {
  Api,
  Credential,
  CredentialInfo,
  CredentialStore,
  Model,
  Models,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { Env } from "../types.js";
import type { Vault } from "./vault.js";
import { installDemoModel } from "./demo.js";

const CREDENTIAL_PREFIX = "llm:";

export function createVaultCredentialStore(vault: Vault): CredentialStore {
  const keyFor = (providerId: string): string => `${CREDENTIAL_PREFIX}${providerId}`;

  return {
    async read(providerId: string): Promise<Credential | undefined> {
      const apiKey = await vault.resolve(keyFor(providerId));
      if (!apiKey) return undefined;
      return { type: "api_key", key: apiKey };
    },
    async list(): Promise<readonly CredentialInfo[]> {
      const metas = vault.listMeta();
      const out: CredentialInfo[] = [];
      for (const m of metas) {
        if (m.name.startsWith(CREDENTIAL_PREFIX)) {
          out.push({ providerId: m.name.slice(CREDENTIAL_PREFIX.length), type: "api_key" });
        }
      }
      return out;
    },
    async modify(
      providerId: string,
      fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    ): Promise<Credential | undefined> {
      const current = await this.read(providerId);
      const next = await fn(current);
      if (next && next.type === "api_key" && typeof next.key === "string") {
        await vault.set(keyFor(providerId), next.key, `${providerId} API key`, "llm");
      } else if (!next) {
        vault.delete(keyFor(providerId));
      }
      return next;
    },
    async delete(providerId: string): Promise<void> {
      vault.delete(keyFor(providerId));
    },
  };
}

export function buildModels(vault: Vault): { models: Models; credentials: CredentialStore } {
  const credentials = createVaultCredentialStore(vault);
  const models = builtinModels({ credentials });
  installDemoModel(models);
  return { models, credentials };
}

export function parseModelSpec(
  spec: string | null | undefined,
): { provider: string; id: string } | null {
  if (!spec) return null;
  const idx = spec.indexOf("/");
  if (idx <= 0 || idx === spec.length - 1) return null;
  return { provider: spec.slice(0, idx), id: spec.slice(idx + 1) };
}

export function resolveModel(
  models: Models,
  spec: string | null | undefined,
  env?: Pick<Env, "AI_GATEWAY_URL">,
): Model<Api> | undefined {
  const parsed = parseModelSpec(spec);
  if (!parsed) return undefined;
  const model = models.getModel(parsed.provider, parsed.id) as Model<Api> | undefined;
  if (!model) return undefined;
  if (env?.AI_GATEWAY_URL) {
    return {
      ...model,
      baseUrl: env.AI_GATEWAY_URL.replace(/\/$/, ""),
    };
  }
  return model;
}
