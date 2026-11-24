import type { McpServerRecord } from "../types.js";
import type { Vault } from "./vault.js";
import type { ExecutionGuards } from "./guards.js";

export interface McpToolDef {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class McpHub {
  private readonly sql: SqlStorage;
  private readonly vault: Vault;
  private readonly guards: ExecutionGuards;
  private readonly toolCache = new Map<string, McpToolDef[]>();

  constructor(sql: SqlStorage, vault: Vault, guards: ExecutionGuards) {
    this.sql = sql;
    this.vault = vault;
    this.guards = guards;
  }

  listServers(): McpServerRecord[] {
    const rows = this.sql
      .exec(`SELECT id, name, url, headers_json, enabled, updated_at FROM tock_mcp_servers ORDER BY name ASC`)
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      url: String(r.url),
      headersJson: String(r.headers_json ?? "{}"),
      enabled: Number(r.enabled) === 1,
      updatedAt: Number(r.updated_at)
    }));
  }

  upsertServer(name: string, url: string, headers: Record<string, string> = {}): McpServerRecord {
    const id = crypto.randomUUID();
    const now = Date.now();
    const headersJson = JSON.stringify(headers);
    this.sql.exec(
      `INSERT INTO tock_mcp_servers (id, name, url, headers_json, enabled, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(name) DO UPDATE SET
         url = excluded.url,
         headers_json = excluded.headers_json,
         enabled = 1,
         updated_at = excluded.updated_at`,
      id,
      name,
      url,
      headersJson,
      now
    );
    this.toolCache.delete(name);
    const row = this.sql
      .exec(`SELECT id, name, url, headers_json, enabled, updated_at FROM tock_mcp_servers WHERE name = ?`, name)
      .one();
    return {
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      headersJson: String(row.headers_json ?? "{}"),
      enabled: Number(row.enabled) === 1,
      updatedAt: Number(row.updated_at)
    };
  }

  deleteServer(idOrName: string): boolean {
    const rows = this.sql
      .exec(`SELECT name FROM tock_mcp_servers WHERE id = ? OR name = ?`, idOrName, idOrName)
      .toArray();
    if (rows.length === 0) return false;
    for (const r of rows) {
      this.toolCache.delete(String(r.name));
    }
    this.sql.exec(`DELETE FROM tock_mcp_servers WHERE id = ? OR name = ?`, idOrName, idOrName);
    return true;
  }

  private getServer(name: string): McpServerRecord | undefined {
    const rows = this.sql
      .exec(`SELECT id, name, url, headers_json, enabled, updated_at FROM tock_mcp_servers WHERE name = ? AND enabled = 1`, name)
      .toArray();
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: String(r.id),
      name: String(r.name),
      url: String(r.url),
      headersJson: String(r.headers_json ?? "{}"),
      enabled: Number(r.enabled) === 1,
      updatedAt: Number(r.updated_at)
    };
  }

  private async rpc(server: McpServerRecord, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const check = this.guards.recordSubrequest(1);
    if (!check.allowed) {
      throw new Error(`subrequest_budget_exceeded_${check.limit}`);
    }
    const rawHeaders = JSON.parse(server.headersJson || "{}") as Record<string, string>;
    const resolvedHeaders = await this.vault.injectRecord(rawHeaders);
    const url = await this.vault.injectTemplate(server.url);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...resolvedHeaders
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params: params ?? {}
      })
    });
    if (!res.ok) {
      const errText = await this.vault.redact(await res.text());
      throw new Error(`mcp_${server.name}_http_${res.status}: ${errText.slice(0, 300)}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    let payload: JsonRpcResponse;
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      const dataLine = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .pop();
      payload = dataLine ? (JSON.parse(dataLine) as JsonRpcResponse) : {};
    } else {
      payload = (await res.json()) as JsonRpcResponse;
    }
    if (payload.error) {
      throw new Error(`mcp_${server.name}_rpc_${payload.error.code ?? "err"}: ${payload.error.message ?? "unknown"}`);
    }
    return payload.result;
  }

  async discoverTools(serverName: string, force = false): Promise<McpToolDef[]> {
    if (!force && this.toolCache.has(serverName)) {
      return this.toolCache.get(serverName)!;
    }
    const server = this.getServer(serverName);
    if (!server) {
      throw new Error(`mcp_server_not_found:${serverName}`);
    }
    const res = (await this.rpc(server, "tools/list")) as {
      tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
    };
    const tools: McpToolDef[] = (res?.tools ?? []).map((t) => ({
      serverName,
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object", properties: {} }
    }));
    this.toolCache.set(serverName, tools);
    return tools;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const server = this.getServer(serverName);
    if (!server) {
      throw new Error(`mcp_server_not_found:${serverName}`);
    }
    const result = await this.rpc(server, "tools/call", { name: toolName, arguments: args });
    const serialized = typeof result === "string" ? result : JSON.stringify(result);
    const safe = await this.vault.redact(serialized);
    try {
      return JSON.parse(safe);
    } catch {
      return safe;
    }
  }
}
