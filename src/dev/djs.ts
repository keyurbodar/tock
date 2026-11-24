import { Sandbox } from "@earendil-works/djs";
import djsWasm from "@earendil-works/djs/wasm/djs.wasm";
import type { DevPluginRecord } from "../types.js";
import type { Vault } from "../core/vault.js";
import type { UnifiedMemory } from "../core/memory.js";
import type { ExecutionGuards } from "../core/guards.js";
import type { FileStore } from "../core/files.js";

export const TOCK_CODEMODE_DTS = `declare namespace tock {
  function fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; ok: boolean; body: string }>;
  function callMcp(server: string, tool: string, args?: Record<string, unknown>): Promise<unknown>;
  function memorySearch(query: string, limit?: number): Promise<Array<{ id: string; kind: string; content: string }>>;
  function memorySave(kind: "fact" | "decision" | "summary" | "preference", content: string): Promise<{ addedIds: string[] }>;
  function readFile(id: string): Promise<{ name: string; mime: string; text: string } | null>;
  function writeFile(name: string, content: string, mime?: string): Promise<{ id: string; name: string; size: number }>;
  function listFiles(): Promise<Array<{ id: string; name: string; mime: string; size: number }>>;
  function scheduleFollowup(delaySeconds: number, note: string): Promise<{ scheduleId: string }>;
  function notify(title: string, body: string): Promise<{ notified: boolean }>;
}`;

export interface DjsHostBridge {
  vault: Vault;
  memory: UnifiedMemory;
  guards: ExecutionGuards;
  files: FileStore;
  notifyOwner: (title: string, body: string) => Promise<void>;
  scheduleFollowup: (delaySeconds: number, note: string) => Promise<string>;
  callMcpTool?: (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface DjsRunResult {
  ok: boolean;
  valueJson?: string;
  logs: string[];
  error?: string;
}

const DEFAULT_MEMORY_LIMIT = 32 << 20;
const DEFAULT_MAX_FUEL = 2_000_000;

export class DjsRuntime {
  private readonly sql: SqlStorage;
  private readonly bridge: DjsHostBridge;

  constructor(sql: SqlStorage, bridge: DjsHostBridge) {
    this.sql = sql;
    this.bridge = bridge;
  }

  listPlugins(): DevPluginRecord[] {
    const rows = this.sql
      .exec(
        `SELECT id, name, kind, description, schema_json, ts_source, enabled, updated_at
         FROM tock_dev_plugins ORDER BY name ASC`,
      )
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: r.kind === "webhook_filter" ? "webhook_filter" : "tool",
      description: String(r.description ?? ""),
      schemaJson: String(r.schema_json ?? "{}"),
      tsSource: String(r.ts_source),
      enabled: Number(r.enabled) === 1,
      updatedAt: Number(r.updated_at),
    }));
  }

  getPlugin(idOrName: string): DevPluginRecord | undefined {
    const rows = this.sql
      .exec(
        `SELECT id, name, kind, description, schema_json, ts_source, enabled, updated_at
         FROM tock_dev_plugins WHERE id = ? OR name = ?`,
        idOrName,
        idOrName,
      )
      .toArray();
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: String(r.id),
      name: String(r.name),
      kind: r.kind === "webhook_filter" ? "webhook_filter" : "tool",
      description: String(r.description ?? ""),
      schemaJson: String(r.schema_json ?? "{}"),
      tsSource: String(r.ts_source),
      enabled: Number(r.enabled) === 1,
      updatedAt: Number(r.updated_at),
    };
  }

  upsertPlugin(
    input: Omit<DevPluginRecord, "id" | "updatedAt"> & { id?: string },
  ): DevPluginRecord {
    const id = input.id || crypto.randomUUID();
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_dev_plugins (id, name, kind, description, schema_json, ts_source, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         kind = excluded.kind,
         description = excluded.description,
         schema_json = excluded.schema_json,
         ts_source = excluded.ts_source,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      id,
      input.name,
      input.kind,
      input.description,
      input.schemaJson,
      input.tsSource,
      input.enabled ? 1 : 0,
      now,
    );
    return { ...input, id, updatedAt: now };
  }

  deletePlugin(id: string): boolean {
    const exists = this.sql
      .exec(`SELECT id FROM tock_dev_plugins WHERE id = ? OR name = ?`, id, id)
      .toArray().length;
    if (exists === 0) return false;
    this.sql.exec(`DELETE FROM tock_dev_plugins WHERE id = ? OR name = ?`, id, id);
    return true;
  }

  async runWebhookFilter(
    pluginIdOrName: string,
    payload: unknown,
  ): Promise<{ pass: boolean; summary?: string }> {
    const plugin = this.getPlugin(pluginIdOrName);
    if (!plugin || !plugin.enabled || plugin.kind !== "webhook_filter") {
      return { pass: true };
    }
    const res = await this.runCode(plugin.tsSource, { payload });
    if (!res.ok) return { pass: true };
    try {
      const parsed = JSON.parse(res.valueJson ?? "true") as
        | boolean
        | { pass?: boolean; summary?: string };
      if (typeof parsed === "boolean") return { pass: parsed };
      return { pass: parsed.pass !== false, summary: parsed.summary };
    } catch {
      return { pass: true };
    }
  }

  async runCode(
    tsSource: string,
    params: Record<string, unknown> = {},
    opts?: { maxFuel?: number; memoryLimit?: number },
  ): Promise<DjsRunResult> {
    const logs: string[] = [];
    const pushLog = (...args: unknown[]) => {
      if (logs.length >= 100) return;
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };

    const sb = await Sandbox.create({
      module: djsWasm,
      memoryLimit: opts?.memoryLimit ?? DEFAULT_MEMORY_LIMIT,
      maxFuel: opts?.maxFuel ?? DEFAULT_MAX_FUEL,
      jsonBoundary: true,
      typescript: true,
      console: {
        log: pushLog,
        info: pushLog,
        warn: pushLog,
        error: pushLog,
        debug: pushLog,
      },
      asyncFunctions: {
        "tock.fetch": async (url: unknown, init?: unknown) => {
          const check = this.bridge.guards.recordSubrequest(1);
          if (!check.allowed) {
            throw new Error(`subrequest_budget_exceeded_${check.limit}`);
          }
          const rawUrl = String(url);
          const resolvedUrl = await this.bridge.vault.injectForUrl(rawUrl, rawUrl);
          const reqInit = (init && typeof init === "object" ? init : {}) as {
            method?: string;
            headers?: Record<string, string>;
            body?: string;
          };
          const headers = reqInit.headers
            ? await this.bridge.vault.injectRecordForUrl(resolvedUrl, reqInit.headers)
            : undefined;
          const body =
            typeof reqInit.body === "string"
              ? await this.bridge.vault.injectForUrl(resolvedUrl, reqInit.body)
              : undefined;
          const res = await fetch(resolvedUrl, { method: reqInit.method ?? "GET", headers, body });
          const rawText = await res.text();
          const safeText = await this.bridge.vault.redact(rawText);
          return { status: res.status, ok: res.ok, body: safeText };
        },
        "tock.memorySearch": (query: unknown, limit?: unknown) => {
          return this.bridge.memory.search(String(query), typeof limit === "number" ? limit : 6);
        },
        "tock.memorySave": (kind: unknown, content: unknown) => {
          const k = String(kind) as "fact" | "decision" | "summary" | "preference";
          return this.bridge.memory.applyBatch({
            addItems: [{ kind: k, content: String(content) }],
          });
        },
        "tock.readFile": async (id: unknown) => {
          const found = await this.bridge.files.readText(String(id));
          if (!found) return null;
          return { name: found.meta.name, mime: found.meta.mime, text: found.text };
        },
        "tock.writeFile": async (name: unknown, content: unknown, mime?: unknown) => {
          const bytes = new TextEncoder().encode(String(content));
          const meta = await this.bridge.files.put(
            String(name),
            String(mime ?? "text/plain"),
            bytes,
          );
          return { id: meta.id, name: meta.name, size: meta.size };
        },
        "tock.listFiles": () => {
          return this.bridge.files
            .list()
            .map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size }));
        },
        "tock.notify": async (title: unknown, body: unknown) => {
          await this.bridge.notifyOwner(String(title), String(body));
          return { notified: true };
        },
        "tock.scheduleFollowup": async (delaySeconds: unknown, note: unknown) => {
          const id = await this.bridge.scheduleFollowup(Number(delaySeconds), String(note));
          return { scheduleId: id };
        },
        "tock.callMcp": async (server: unknown, tool: unknown, args?: unknown) => {
          if (!this.bridge.callMcpTool) {
            throw new Error("mcp_not_available");
          }
          const res = await this.bridge.callMcpTool(
            String(server),
            String(tool),
            (args && typeof args === "object" ? args : {}) as Record<string, unknown>,
          );
          return this.bridge.vault.redact(typeof res === "string" ? res : JSON.stringify(res));
        },
      },
    });

    try {
      const value = await sb.runAsync(tsSource, params);
      const safeLogs = await Promise.all(logs.map((l) => this.bridge.vault.redact(l)));
      return {
        ok: true,
        valueJson: value === undefined ? undefined : JSON.stringify(value),
        logs: safeLogs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const safeError = await this.bridge.vault.redact(msg);
      const safeLogs = await Promise.all(logs.map((l) => this.bridge.vault.redact(l)));
      return { ok: false, error: safeError, logs: safeLogs };
    } finally {
      sb.dispose();
    }
  }
}
