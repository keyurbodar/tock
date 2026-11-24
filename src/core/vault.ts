import type { SecretMeta } from "../types.js";

const SECRET_TEMPLATE_RE = /\{\{secret:([a-zA-Z0-9_.-]+)\}\}/g;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export class Vault {
  private readonly sql: SqlStorage;
  private readonly masterSecret: string;
  private keyPromise: Promise<CryptoKey> | null = null;
  private plainCache: Map<string, string> | null = null;

  constructor(sql: SqlStorage, masterSecret: string) {
    this.sql = sql;
    this.masterSecret = masterSecret;
  }

  private async getKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = (async () => {
        const raw = new TextEncoder().encode(this.masterSecret || "tock-dev-ephemeral-key");
        const digest = await crypto.subtle.digest("SHA-256", raw);
        return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      })();
    }
    return this.keyPromise;
  }

  async set(name: string, value: string, description = "", scopes = ""): Promise<void> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_secrets (name, description, scopes, ciphertext_b64, iv_b64, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         scopes = excluded.scopes,
         ciphertext_b64 = excluded.ciphertext_b64,
         iv_b64 = excluded.iv_b64,
         updated_at = excluded.updated_at`,
      name,
      description,
      scopes,
      toB64(new Uint8Array(ct)),
      toB64(iv),
      now
    );
    if (this.plainCache) {
      this.plainCache.set(name, value);
    }
  }

  delete(name: string): boolean {
    const before = this.sql.exec(`SELECT name FROM tock_secrets WHERE name = ?`, name).toArray().length;
    if (before === 0) return false;
    this.sql.exec(`DELETE FROM tock_secrets WHERE name = ?`, name);
    this.plainCache?.delete(name);
    return true;
  }

  listMeta(): SecretMeta[] {
    const rows = this.sql
      .exec(`SELECT name, description, scopes, updated_at FROM tock_secrets ORDER BY name ASC`)
      .toArray();
    return rows.map((r) => ({
      name: String(r.name),
      description: String(r.description ?? ""),
      scopes: String(r.scopes ?? ""),
      updatedAt: Number(r.updated_at)
    }));
  }

  private async ensureCache(): Promise<Map<string, string>> {
    if (this.plainCache) return this.plainCache;
    const key = await this.getKey();
    const rows = this.sql.exec(`SELECT name, ciphertext_b64, iv_b64 FROM tock_secrets`).toArray();
    const cache = new Map<string, string>();
    for (const r of rows) {
      try {
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: fromB64(String(r.iv_b64)) },
          key,
          fromB64(String(r.ciphertext_b64))
        );
        cache.set(String(r.name), new TextDecoder().decode(pt));
      } catch {
        continue;
      }
    }
    this.plainCache = cache;
    return cache;
  }

  async resolve(name: string): Promise<string | undefined> {
    const cache = await this.ensureCache();
    return cache.get(name);
  }

  async injectTemplate(input: string): Promise<string> {
    if (!input.includes("{{secret:")) return input;
    const cache = await this.ensureCache();
    return input.replace(SECRET_TEMPLATE_RE, (match, name: string) => {
      const val = cache.get(name);
      return val !== undefined ? val : match;
    });
  }

  async injectRecord(record: Record<string, string>): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = await this.injectTemplate(v);
    }
    return out;
  }

  async redact(text: string): Promise<string> {
    if (!text) return text;
    const cache = await this.ensureCache();
    let result = text;
    for (const [name, value] of cache.entries()) {
      if (value.length >= 6 && result.includes(value)) {
        result = result.split(value).join(`[REDACTED:${name}]`);
      }
    }
    return result;
  }

  renderManifest(): string {
    const metas = this.listMeta();
    if (metas.length === 0) return "";
    return metas
      .map((m) => `- {{secret:${m.name}}}${m.description ? ` — ${m.description}` : ""}${m.scopes ? ` [${m.scopes}]` : ""}`)
      .join("\n");
  }
}
