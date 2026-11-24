import type { PushSubscriptionRecord } from "../types.js";
import type { Vault } from "./vault.js";
import type { ExecutionGuards } from "./guards.js";

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface VapidConfig {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}

export class PushNotifier {
  private readonly sql: SqlStorage;
  private readonly vault: Vault;
  private readonly guards: ExecutionGuards;
  private readonly vapid: VapidConfig;

  constructor(sql: SqlStorage, vault: Vault, guards: ExecutionGuards, vapid: VapidConfig = {}) {
    this.sql = sql;
    this.vault = vault;
    this.guards = guards;
    this.vapid = vapid;
  }

  subscribe(endpoint: string, p256dh: string, auth: string): PushSubscriptionRecord {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_push_subs (endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
      endpoint,
      p256dh,
      auth,
      now
    );
    return { endpoint, p256dh, auth, createdAt: now };
  }

  unsubscribe(endpoint: string): boolean {
    const exists = this.sql.exec(`SELECT endpoint FROM tock_push_subs WHERE endpoint = ?`, endpoint).toArray().length;
    if (exists === 0) return false;
    this.sql.exec(`DELETE FROM tock_push_subs WHERE endpoint = ?`, endpoint);
    return true;
  }

  listSubscriptions(): PushSubscriptionRecord[] {
    return this.sql
      .exec(`SELECT endpoint, p256dh, auth, created_at FROM tock_push_subs ORDER BY created_at DESC`)
      .toArray()
      .map((r) => ({
        endpoint: String(r.endpoint),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
        createdAt: Number(r.created_at)
      }));
  }

  private async signVapidJwt(audience: string): Promise<string | null> {
    if (!this.vapid.publicKey || !this.vapid.privateKey) return null;
    try {
      const pubBytes = base64UrlDecode(this.vapid.publicKey);
      if (pubBytes.length !== 65 || pubBytes[0] !== 4) return null;
      const x = base64UrlEncode(pubBytes.slice(1, 33));
      const y = base64UrlEncode(pubBytes.slice(33, 65));
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x, y, d: this.vapid.privateKey },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
      const enc = new TextEncoder();
      const header = base64UrlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
      const payload = base64UrlEncode(
        enc.encode(
          JSON.stringify({
            aud: audience,
            exp: Math.floor(Date.now() / 1000) + 12 * 3600,
            sub: this.vapid.subject || "mailto:tock@local"
          })
        )
      );
      const sig = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        enc.encode(`${header}.${payload}`)
      );
      return `${header}.${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
    } catch {
      return null;
    }
  }

  async deliverOffline(title: string, body: string): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    const webhookUrl = await this.vault.resolve("notify_webhook_url");
    if (webhookUrl) {
      const check = this.guards.recordSubrequest(1);
      if (check.allowed) {
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title, body, text: `${title}\n${body}`, ts: Date.now() })
          });
          if (res.ok) sent += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
    }

    const telegramToken = await this.vault.resolve("telegram_bot_token");
    const telegramChatId = await this.vault.resolve("telegram_chat_id");
    if (telegramToken && telegramChatId) {
      const check = this.guards.recordSubrequest(1);
      if (check.allowed) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: telegramChatId, text: `${title}\n\n${body}` })
          });
          if (res.ok) sent += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
    }

    if (this.vapid.publicKey && this.vapid.privateKey) {
      for (const sub of this.listSubscriptions()) {
        const check = this.guards.recordSubrequest(1);
        if (!check.allowed) break;
        try {
          const origin = new URL(sub.endpoint).origin;
          const jwt = await this.signVapidJwt(origin);
          if (!jwt) continue;
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              TTL: "86400",
              Authorization: `vapid t=${jwt}, k=${this.vapid.publicKey}`
            }
          });
          if (res.status === 404 || res.status === 410) {
            this.unsubscribe(sub.endpoint);
            failed += 1;
          } else if (res.ok) {
            sent += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }
    }

    return { sent, failed };
  }
}
