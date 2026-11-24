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

export function normalizeSecretOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid secret origin: "${origin}". Expected https://host`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Secret origin must use https:// (got "${parsed.protocol}")`);
  }
  return parsed.origin;
}

interface CachedSecret {
  value: string;
  origin: string;
}

export class Vault {
  private readonly sql: SqlStorage;
  private readonly masterSecret: string;
  private keyPromise: Promise<CryptoKey> | null = null;
  private plainCache: Map<string, CachedSecret> | null = null;

  constructor(sql: SqlStorage, masterSecret: string) {
    this.sql = sql;
    this.masterSecret = masterSecret;
  }

  private async getKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      const secret = this.masterSecret.trim();
      if (!secret) {
        throw new Error("VAULT_MASTER_KEY is required");
      }
      this.keyPromise = (async () => {
        const raw = new TextEncoder().encode(secret);
        const digest = await crypto.subtle.digest("SHA-256", raw);
        return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
          "encrypt",
          "decrypt",
        ]);
      })();
    }
    return this.keyPromise;
  }

  async set(
    name: string,
    value: string,
    description = "",
    scopes = "",
    origin = "",
  ): Promise<void> {
    const normalizedOrigin = normalizeSecretOrigin(origin);
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(value),
    );
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_secrets (name, description, scopes, origin, ciphertext_b64, iv_b64, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         scopes = excluded.scopes,
         origin = excluded.origin,
         ciphertext_b64 = excluded.ciphertext_b64,
         iv_b64 = excluded.iv_b64,
         updated_at = excluded.updated_at`,
      name,
      description,
      scopes,
      normalizedOrigin,
      toB64(new Uint8Array(ct)),
      toB64(iv),
      now,
    );
    if (this.plainCache) {
      this.plainCache.set(name, { value, origin: normalizedOrigin });
    }
  }

  async update(
    name: string,
    changes: { rename?: string; value?: string; description?: string; origin?: string },
  ): Promise<void> {
    const find = (key: string) =>
      this.sql
        .exec(`SELECT description, scopes, origin FROM tock_secrets WHERE name = ?`, key)
        .toArray()[0];
    const row = find(name);
    if (!row) throw new Error(`secret_not_found:${name}`);
    const target = changes.rename ?? name;
    if (target !== name && find(target)) throw new Error(`secret_exists:${target}`);
    const stored = String(row.origin ?? "");
    const origin = changes.origin === undefined ? stored : normalizeSecretOrigin(changes.origin);
    const description = changes.description ?? String(row.description ?? "");
    if (changes.value === undefined) {
      if (origin !== stored) throw new Error("secret_value_required_for_origin_change");
      this.sql.exec(
        `UPDATE tock_secrets SET name = ?, description = ?, updated_at = ? WHERE name = ?`,
        target,
        description,
        Date.now(),
        name,
      );
      const cached = this.plainCache?.get(name);
      if (cached && target !== name) {
        this.plainCache?.set(target, cached);
        this.plainCache?.delete(name);
      }
      return;
    }
    await this.set(target, changes.value, description, String(row.scopes ?? ""), origin);
    if (target !== name) this.delete(name);
  }

  delete(name: string): boolean {
    const before = this.sql
      .exec(`SELECT name FROM tock_secrets WHERE name = ?`, name)
      .toArray().length;
    if (before === 0) return false;
    this.sql.exec(`DELETE FROM tock_secrets WHERE name = ?`, name);
    this.plainCache?.delete(name);
    return true;
  }

  listMeta(): SecretMeta[] {
    const rows = this.sql
      .exec(
        `SELECT name, description, scopes, origin, updated_at FROM tock_secrets ORDER BY name ASC`,
      )
      .toArray();
    return rows.map((r) => ({
      name: String(r.name),
      description: String(r.description ?? ""),
      scopes: String(r.scopes ?? ""),
      origin: String(r.origin ?? ""),
      updatedAt: Number(r.updated_at),
    }));
  }

  private async ensureCache(): Promise<Map<string, CachedSecret>> {
    if (this.plainCache) return this.plainCache;
    const key = await this.getKey();
    const rows = this.sql
      .exec(`SELECT name, origin, ciphertext_b64, iv_b64 FROM tock_secrets`)
      .toArray();
    const cache = new Map<string, CachedSecret>();
    for (const r of rows) {
      try {
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: fromB64(String(r.iv_b64)) },
          key,
          fromB64(String(r.ciphertext_b64)),
        );
        cache.set(String(r.name), {
          value: new TextDecoder().decode(pt),
          origin: String(r.origin ?? ""),
        });
      } catch {
        continue;
      }
    }
    this.plainCache = cache;
    return cache;
  }

  async resolve(name: string): Promise<string | undefined> {
    const cache = await this.ensureCache();
    return cache.get(name)?.value;
  }

  async injectForUrl(targetUrl: string, input: string): Promise<string> {
    if (!input.includes("{{secret:")) return input;
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new Error("Invalid target URL for secret injection");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Secrets can only be injected into https:// requests");
    }
    const cache = await this.ensureCache();
    return input.replace(SECRET_TEMPLATE_RE, (match, name: string) => {
      const entry = cache.get(name);
      if (!entry) return match;
      if (!entry.origin) {
        throw new Error(
          `Secret "${name}" is not bound to an https:// origin and cannot be sent in HTTP requests`,
        );
      }
      if (entry.origin !== parsed.origin) {
        throw new Error(
          `Secret "${name}" is locked to ${entry.origin}, refusing to send to ${parsed.origin}`,
        );
      }
      return entry.value;
    });
  }

  async injectRecordForUrl(
    targetUrl: string,
    record: Record<string, string>,
  ): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = await this.injectForUrl(targetUrl, v);
    }
    return out;
  }

  async redact(text: string): Promise<string> {
    if (!text) return text;
    const cache = await this.ensureCache();
    let result = text;
    for (const [name, { value }] of cache.entries()) {
      if (value.length < 6) continue;
      const replacement = `[REDACTED:${name}]`;
      if (result.includes(value)) {
        result = result.split(value).join(replacement);
      }
      const urlEncoded = encodeURIComponent(value);
      if (urlEncoded !== value && result.includes(urlEncoded)) {
        result = result.split(urlEncoded).join(replacement);
      }
      try {
        const b64 = btoa(value);
        if (b64.length >= 8 && result.includes(b64)) {
          result = result.split(b64).join(replacement);
        }
      } catch {
        continue;
      }
    }
    return result;
  }

  renderManifest(): string {
    const metas = this.listMeta().filter((m) => m.origin);
    if (metas.length === 0) return "";
    return metas
      .map(
        (m) =>
          `- {{secret:${m.name}}} (origin: ${m.origin})${m.description ? ` — ${m.description}` : ""}${m.scopes ? ` [${m.scopes}]` : ""}`,
      )
      .join("\n");
  }
}
