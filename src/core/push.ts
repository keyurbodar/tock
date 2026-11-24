import type { PushSubscriptionRecord } from "../types.js";
import type { Vault } from "./vault.js";
import type { ExecutionGuards } from "./guards.js";

export class PushNotifier {
  private readonly sql: SqlStorage;
  private readonly vault: Vault;
  private readonly guards: ExecutionGuards;

  constructor(sql: SqlStorage, vault: Vault, guards: ExecutionGuards) {
    this.sql = sql;
    this.vault = vault;
    this.guards = guards;
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

    return { sent, failed };
  }
}
