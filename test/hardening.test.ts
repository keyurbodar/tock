import { env, evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openPiSessionStore } from "agents/harness/pi";
import { Vault } from "../src/core/vault.js";
import { encryptWebPushPayload, fitPushPayload } from "../src/core/push.js";
import { ensureSchema } from "../src/db/schema.js";
import { isBackgroundReadOnlyViolation, needsRetry } from "../src/core/resilience.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("tock production hardening", () => {
  it("validates HTTP bodies with pi-schema and enforces 256KB webhook body cap", async () => {
    const badSettings = await SELF.fetch("https://tock.local/api/settings", {
      method: "PATCH",
      headers: { "x-tock-owner": "schema@test", "content-type": "application/json" },
      body: JSON.stringify({ maxSubagents: 999 }),
    });
    expect(badSettings.status).toBe(400);
    const badBody = (await badSettings.json()) as { ok: boolean; error: string };
    expect(badBody.ok).toBe(false);
    expect(badBody.error).toBe("invalid_body");

    const badChat = await SELF.fetch("https://tock.local/api/chat", {
      method: "POST",
      headers: { "x-tock-owner": "schema@test", "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(badChat.status).toBe(400);

    const bigPayload = JSON.stringify({ data: "x".repeat(270 * 1024) });
    const bigHook = await SELF.fetch("https://tock.local/api/hooks/test?owner=schema@test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bigPayload,
    });
    expect(bigHook.status).toBe(413);
  });

  it("enforces origin-locked HTTPS secrets, fail-closed vault key, and URL/base64 redaction", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("vault-origin@test"));
    await runInDurableObject(stub, async (_instance, state) => {
      const brokenVault = new Vault(state.storage.sql, "");
      await expect(brokenVault.set("k", "val")).rejects.toThrow("VAULT_MASTER_KEY is required");

      const vault = new Vault(state.storage.sql, "test-master-key-32-bytes-minimum-1234");
      await vault.set("openai_api_key", "sk-llm-secret-123456", "LLM key", "llm");
      await vault.set(
        "gh_pat",
        "ghp_tok+slash/eq=999",
        "GitHub",
        "repo",
        "https://api.github.com/v3",
      );

      await expect(
        vault.set("bad_http", "val", "", "", "http://insecure.example.com"),
      ).rejects.toThrow("https://");

      await expect(
        vault.injectForUrl("https://evil.com/steal", "Bearer {{secret:openai_api_key}}"),
      ).rejects.toThrow("not bound to an https:// origin");
      await expect(
        vault.injectForUrl("https://evil.com/steal", "Bearer {{secret:gh_pat}}"),
      ).rejects.toThrow("locked to https://api.github.com");
      await expect(
        vault.injectForUrl("http://api.github.com/user", "Bearer {{secret:gh_pat}}"),
      ).rejects.toThrow("https://");

      const okHeader = await vault.injectForUrl(
        "https://api.github.com/user",
        "Bearer {{secret:gh_pat}}",
      );
      expect(okHeader).toBe("Bearer ghp_tok+slash/eq=999");

      const raw = "ghp_tok+slash/eq=999";
      const leaked = `raw=${raw} url=${encodeURIComponent(raw)} b64=${btoa(raw)}`;
      const redacted = await vault.redact(leaked);
      expect(redacted).not.toContain(raw);
      expect(redacted).not.toContain(encodeURIComponent(raw));
      expect(redacted).not.toContain(btoa(raw));
      expect(redacted).toContain("[REDACTED:gh_pat]");
    });
  });

  it("encrypts Web Push payloads using RFC 8291 aes128gcm framing", async () => {
    const subscriber = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    if (!("publicKey" in subscriber)) throw new Error("expected key pair");
    const rawPub = new Uint8Array(
      (await crypto.subtle.exportKey("raw", subscriber.publicKey)) as ArrayBuffer,
    );
    const auth = crypto.getRandomValues(new Uint8Array(16));

    const plaintext = new TextEncoder().encode(
      JSON.stringify({ title: "Tock", body: "Deploy ready" }),
    );
    const body = await encryptWebPushPayload(
      { p256dh: base64UrlEncode(rawPub), auth: base64UrlEncode(auth) },
      plaintext,
    );

    expect(body.length).toBeGreaterThan(86 + plaintext.length);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    expect(view.getUint32(16, false)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(0x04);
  });

  it("reclassifies transient provider errors and enforces read-only background tool guard via MCP annotations", async () => {
    const baseMsg = {
      role: "assistant",
      content: [],
      api: "openai-responses",
      provider: "openai",
      model: "gpt-4o",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "error",
      timestamp: Date.now(),
    } as unknown as AssistantMessage;

    expect(needsRetry({ ...baseMsg, errorMessage: "522 origin unreachable" })).toBe(true);
    expect(needsRetry({ ...baseMsg, errorMessage: "Unexpected end of JSON input" })).toBe(true);
    expect(needsRetry({ ...baseMsg, errorMessage: "401 invalid api key" })).toBe(false);
    expect(needsRetry({ ...baseMsg, errorMessage: "insufficient credit balance" })).toBe(false);

    const checkReadOnly = async (_server: string, tool: string) => tool === "list_issues";
    expect(
      await isBackgroundReadOnlyViolation(
        "http_request",
        { method: "GET", url: "https://example.com" },
        checkReadOnly,
      ),
    ).toBeNull();
    expect(
      await isBackgroundReadOnlyViolation(
        "http_request",
        { method: "POST", url: "https://example.com" },
        checkReadOnly,
      ),
    ).toContain("background_read_only");
    expect(
      await isBackgroundReadOnlyViolation(
        "mcp_call",
        { server: "gh", tool: "list_issues" },
        checkReadOnly,
      ),
    ).toBeNull();
    expect(
      await isBackgroundReadOnlyViolation(
        "mcp_call",
        { server: "gh", tool: "delete_issue" },
        checkReadOnly,
      ),
    ).toContain("background_read_only");
  });

  it("validates WS frames, replays events by cursor, and persists state across DO eviction", async () => {
    const owner = "ws-evict@test";
    const res = await SELF.fetch("https://tock.local/ws", {
      headers: { upgrade: "websocket", "x-tock-owner": owner },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();

    const received: unknown[] = [];
    ws.addEventListener("message", (ev) => {
      received.push(JSON.parse(String(ev.data)));
    });

    ws.send(JSON.stringify({ id: "bad-1", type: "settings.update", patch: { maxSubagents: 999 } }));
    ws.send(JSON.stringify({ id: "ok-1", type: "settings.update", patch: { maxSubagents: 5 } }));
    ws.send(JSON.stringify({ id: "ping-1", type: "ping" }));

    await new Promise((r) => setTimeout(r, 150));

    expect(
      received.some(
        (f) =>
          (f as { id?: string; code?: string }).id === "bad-1" &&
          (f as { code?: string }).code === "invalid_frame",
      ),
    ).toBe(true);
    expect(
      received.some(
        (f) =>
          (f as { id?: string; type?: string }).id === "ok-1" &&
          (f as { type?: string }).type === "ok",
      ),
    ).toBe(true);
    expect(
      received.some(
        (f) =>
          (f as { id?: string; type?: string }).id === "ping-1" &&
          (f as { type?: string }).type === "pong",
      ),
    ).toBe(true);
    ws.close();

    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName(owner));
    await stub.writeMemory({
      coreContent: "Durable fact before eviction",
      addItems: [{ kind: "fact", content: "Eviction survival test item" }],
    });
    await evictDurableObject(stub);

    const healthAfter = await stub.getHealth();
    expect(healthAfter.settings.maxSubagents).toBe(5);
    const hitsAfter = await stub.searchMemory("Eviction survival");
    expect(hitsAfter.length).toBe(1);

    await runInDurableObject(stub, async (_instance, state) => {
      const ver = state.storage.sql
        .exec<{ value: string }>(`SELECT value FROM tock_meta WHERE key = 'schema_version'`)
        .one();
      expect(Number(ver.value)).toBeGreaterThanOrEqual(1);
    });
  });

  it("rejects insecure non-HTTPS MCP server URLs and persists managerServerId", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("mcp@test"));
    await runInDurableObject(stub, async (instance) => {
      await expect(instance.upsertMcpServer("bad", "http://evil.example.com/mcp")).rejects.toThrow(
        "https://",
      );
    });
    const saved = await stub.upsertMcpServer("good", "https://mcp.example.com/v1");
    expect(saved.managerServerId).toBe(saved.id);
    expect(saved.url).toBe("https://mcp.example.com/v1");
  });

  it("runs a full pi-durable turn on upstream PiHarness store and survives DO eviction", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("pi-turn@test"));
    const convId = await runInDurableObject(stub, async (_instance, state) => {
      const faux = fauxProvider();
      const models = createModels();
      models.setProvider(faux.provider);
      faux.setResponses([fauxAssistantMessage("hello from faux model")]);

      const storage = await openPiSessionStore(state.storage);
      const harness = await Harness.open(
        storage,
        { models, registry: createRegistry() },
        BACKGROUND_CONTEXT,
      );
      const model = faux.getModel();
      const conv = await harness.root(BACKGROUND_CONTEXT, {
        agent: { model: { provider: model.provider, modelId: model.id } },
      });
      const sub = await conv.submit(
        {
          type: "input",
          content: "ping",
        },
        BACKGROUND_CONTEXT,
      );
      await sub.wait(BACKGROUND_CONTEXT);
      await harness.close(BACKGROUND_CONTEXT);
      return conv.id;
    });

    await evictDurableObject(stub);

    await runInDurableObject(stub, async (_instance, state) => {
      const storage = await openPiSessionStore(state.storage);
      const harness = await Harness.open(
        storage,
        { models: createModels(), registry: createRegistry() },
        BACKGROUND_CONTEXT,
      );
      const conv = await harness.conversation(convId, BACKGROUND_CONTEXT);
      expect(conv).toBeDefined();
      const page = await conv!.entries({}, 50, undefined, BACKGROUND_CONTEXT);
      const assistantReply = page.items.find((e) => e.kind === "pi.assistant");
      expect(assistantReply).toBeDefined();
      await harness.close(BACKGROUND_CONTEXT);
    });
  });

  it("manages provider credentials dynamically via pi-ai CredentialStore without hardcoded provider maps", async () => {
    const save = await SELF.fetch("https://tock.local/api/providers/opencode-go/credential", {
      method: "POST",
      headers: { "x-tock-owner": "creds@test", "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "test-key-123" }),
    });
    expect(save.status).toBe(200);

    const list = await SELF.fetch("https://tock.local/api/providers", {
      headers: { "x-tock-owner": "creds@test" },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { providers: Array<{ id: string; configured: boolean }> };
    expect(body.providers.find((p) => p.id === "opencode-go")?.configured).toBe(true);

    const del = await SELF.fetch("https://tock.local/api/providers/opencode-go/credential", {
      method: "DELETE",
      headers: { "x-tock-owner": "creds@test" },
    });
    expect(del.status).toBe(200);
  });
  it("upgrades pre-migration databases in place and keeps legacy provider credentials", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("upgrade@test"));
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec(`DELETE FROM tock_meta`);
      sql.exec(`ALTER TABLE tock_secrets DROP COLUMN origin`);
      sql.exec(`ALTER TABLE tock_mcp_servers DROP COLUMN manager_server_id`);
      sql.exec(
        `INSERT INTO tock_secrets (name, description, scopes, ciphertext_b64, iv_b64, updated_at)
         VALUES ('opencode_api_key', 'opencode-go API key', 'llm', 'x', 'y', 0)`,
      );
      ensureSchema(sql);
      const cols = sql
        .exec<{ name: string }>(`PRAGMA table_info(tock_secrets)`)
        .toArray()
        .map((c) => c.name);
      expect(cols).toContain("origin");
      const mcpCols = sql
        .exec<{ name: string }>(`PRAGMA table_info(tock_mcp_servers)`)
        .toArray()
        .map((c) => c.name);
      expect(mcpCols).toContain("manager_server_id");
      const names = sql
        .exec<{ name: string }>(`SELECT name FROM tock_secrets`)
        .toArray()
        .map((r) => r.name);
      expect(names).toContain("llm:opencode-go");
    });
  });

  it("fits long multibyte push notifications inside one aes128gcm record", async () => {
    const bytes = fitPushPayload("通知".repeat(300), "😀".repeat(1500));
    expect(bytes.length).toBeLessThanOrEqual(3993);
    const subscriber = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    if (!("publicKey" in subscriber)) throw new Error("expected key pair");
    const rawPub = new Uint8Array(
      (await crypto.subtle.exportKey("raw", subscriber.publicKey)) as ArrayBuffer,
    );
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encryptWebPushPayload(
      { p256dh: base64UrlEncode(rawPub), auth: base64UrlEncode(auth) },
      bytes,
    );
    expect(body.length).toBeGreaterThan(bytes.length);
  });
});
