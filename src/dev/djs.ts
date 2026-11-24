import { Sandbox } from "@earendil-works/djs";
import djsWasm from "@earendil-works/djs/wasm/djs.wasm";
import type { DevPluginRecord } from "../types.js";
import type { Vault } from "../core/vault.js";
import type { UnifiedMemory } from "../core/memory.js";
import type { ExecutionGuards } from "../core/guards.js";

export interface DjsHostBridge {
  vault: Vault;
  memory: UnifiedMemory;
  guards: ExecutionGuards;
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
         FROM tock_dev_plugins ORDER BY name ASC`
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
      updatedAt: Number(r.updated_at)
    }));
  }

  upsertPlugin(
    input: Omit<DevPluginRecord, "id" | "updatedAt"> & { id?: string }
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
      now
    );
    return { ...input, id, updatedAt: now };
  }

  deletePlugin(id: string): boolean {
    const exists = this.sql.exec(`SELECT id FROM tock_dev_plugins WHERE id = ? OR name = ?`, id, id).toArray().length;
    if (exists === 0) return false;
    this.sql.exec(`DELETE FROM tock_dev_plugins WHERE id = ? OR name = ?`, id, id);
    return true;
  }

  async runCode(
    tsSource: string,
    params: Record<string, unknown> = {},
    opts?: { maxFuel?: number; memoryLimit?: number }
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
        debug: pushLog
      },
      asyncFunctions: {
        "tock.fetch": async (url: unknown, init?: unknown) => {
          const check = this.bridge.guards.recordSubrequest(1);
          if (!check.allowed) {
            throw new Error(`subrequest_budget_exceeded_${check.limit}`);
          }
          const resolvedUrl = await this.bridge.vault.injectTemplate(String(url));
          const reqInit = (init && typeof init === "object" ? init : {}) as {
            method?: string;
            headers?: Record<string, string>;
            body?: string;
          };
          const headers = reqInit.headers ? await this.bridge.vault.injectRecord(reqInit.headers) : undefined;
          const body = typeof reqInit.body === "string" ? await this.bridge.vault.injectTemplate(reqInit.body) : undefined;
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
          return this.bridge.memory.applyBatch({ addItems: [{ kind: k, content: String(content) }] });
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
            (args && typeof args === "object" ? args : {}) as Record<string, unknown>
          );
          return this.bridge.vault.redact(typeof res === "string" ? res : JSON.stringify(res));
        }
      }
    });

    try {
      const value = await sb.runAsync(tsSource, params);
      const safeLogs = await Promise.all(logs.map((l) => this.bridge.vault.redact(l)));
      return { ok: true, valueJson: value === undefined ? undefined : JSON.stringify(value), logs: safeLogs };
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
