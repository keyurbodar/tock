import { MCPClientManager } from "agents/mcp/client";
import { DurableObjectOAuthClientProvider } from "agents/mcp/do-oauth-client-provider";
import type { McpServerRecord } from "../types.js";
import type { Vault } from "./vault.js";
import type { ExecutionGuards } from "./guards.js";

export interface McpToolDef {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function validateMcpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid MCP server URL: "${raw}"`);
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new Error(`MCP server URL must use https:// (got "${parsed.protocol}")`);
  }
  return parsed.toString();
}

export class McpHub {
  private readonly storage: DurableObjectStorage;
  private readonly sql: SqlStorage;
  private readonly vault: Vault;
  private readonly guards: ExecutionGuards;
  private readonly toolCache = new Map<string, McpToolDef[]>();
  readonly manager: MCPClientManager;

  constructor(
    storage: DurableObjectStorage,
    vault: Vault,
    guards: ExecutionGuards,
    manager?: MCPClientManager,
  ) {
    this.storage = storage;
    this.sql = storage.sql;
    this.vault = vault;
    this.guards = guards;
    this.manager = manager ?? new MCPClientManager("tock", "0.1.0");
  }

  listServers(): McpServerRecord[] {
    const rows = this.sql
      .exec(
        `SELECT id, name, url, headers_json, auth_mode, manager_server_id, enabled, updated_at
         FROM tock_mcp_servers ORDER BY name ASC`,
      )
      .toArray();
    return rows.map((r) => this.mapRow(r));
  }

  async upsertServer(
    name: string,
    url: string,
    headers: Record<string, string> = {},
    authMode: "headers" | "oauth" | "sse" = "headers",
  ): Promise<McpServerRecord> {
    const validatedUrl = validateMcpUrl(url);
    const headersJson = JSON.stringify(headers);
    const previous = this.sql
      .exec(
        `SELECT id, manager_server_id, url, headers_json, auth_mode FROM tock_mcp_servers WHERE name = ?`,
        name,
      )
      .toArray()[0];
    const shouldReconnect =
      previous &&
      (authMode !== "oauth" ||
        previous.url !== validatedUrl ||
        previous.headers_json !== headersJson ||
        previous.auth_mode !== authMode);
    if (previous && shouldReconnect) {
      await this.manager
        .removeServer(String(previous.manager_server_id ?? previous.id))
        .catch(() => {});
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_mcp_servers (id, name, url, headers_json, auth_mode, manager_server_id, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(name) DO UPDATE SET
         url = excluded.url,
         headers_json = excluded.headers_json,
         auth_mode = excluded.auth_mode,
         enabled = 1,
         updated_at = excluded.updated_at`,
      id,
      name,
      validatedUrl,
      headersJson,
      authMode,
      id,
      now,
    );
    this.toolCache.delete(name);
    const row = this.sql
      .exec(
        `SELECT id, name, url, headers_json, auth_mode, manager_server_id, enabled, updated_at
         FROM tock_mcp_servers WHERE name = ?`,
        name,
      )
      .one();
    return this.mapRow(row);
  }

  async connectOAuth(
    name: string,
    url: string,
    callbackHost: string,
  ): Promise<{ id: string; authUrl?: string; clientId?: string; state: string }> {
    const server = await this.upsertServer(name, url, {}, "oauth");
    const serverId = server.managerServerId ?? server.id;
    const callbackUrl = `${callbackHost.replace(/\/$/, "")}/mcp/oauth/callback`;
    const authProvider = new DurableObjectOAuthClientProvider(this.storage, "tock", callbackUrl);
    await this.manager.registerServer(serverId, {
      url: server.url,
      name: server.name,
      callbackUrl,
      transport: {
        authProvider,
        type: "auto",
      },
    });
    const res = await this.manager.connectToServer(serverId);
    if (res.state === "authenticating") {
      return { id: serverId, state: res.state, authUrl: res.authUrl, clientId: res.clientId };
    }
    if (res.state === "connected") {
      await this.manager.discoverIfConnected(serverId);
    }
    return { id: serverId, state: res.state };
  }

  isOAuthCallback(request: Request): boolean {
    return this.manager.isCallbackRequest(request);
  }

  async handleOAuthCallback(request: Request): Promise<Response> {
    const result = await this.manager.handleCallbackRequest(request);
    if (result.authSuccess && result.serverId) {
      await this.manager.establishConnection(result.serverId).catch(() => {});
      this.toolCache.clear();
    }
    return Response.json({
      ok: result.authSuccess,
      serverId: result.serverId,
      ...(result.authSuccess ? {} : { error: result.authError }),
    });
  }

  async deleteServer(idOrName: string): Promise<boolean> {
    const rows = this.sql
      .exec(
        `SELECT id, name, manager_server_id FROM tock_mcp_servers WHERE id = ? OR name = ?`,
        idOrName,
        idOrName,
      )
      .toArray();
    if (rows.length === 0) return false;
    for (const r of rows) {
      this.toolCache.delete(String(r.name));
      const sid = String(r.manager_server_id ?? r.id);
      await this.manager.removeServer(sid).catch(() => {});
    }
    this.sql.exec(`DELETE FROM tock_mcp_servers WHERE id = ? OR name = ?`, idOrName, idOrName);
    return true;
  }

  private mapRow(r: Record<string, SqlStorageValue>): McpServerRecord {
    return {
      id: String(r.id),
      name: String(r.name),
      url: String(r.url),
      headersJson: String(r.headers_json ?? "{}"),
      authMode: r.auth_mode === "oauth" ? "oauth" : r.auth_mode === "sse" ? "sse" : "headers",
      managerServerId: r.manager_server_id ? String(r.manager_server_id) : String(r.id),
      enabled: Number(r.enabled) === 1,
      updatedAt: Number(r.updated_at),
    };
  }

  private getServer(name: string): McpServerRecord | undefined {
    const rows = this.sql
      .exec(
        `SELECT id, name, url, headers_json, auth_mode, manager_server_id, enabled, updated_at
         FROM tock_mcp_servers WHERE name = ? AND enabled = 1`,
        name,
      )
      .toArray();
    const r = rows[0];
    return r ? this.mapRow(r) : undefined;
  }

  private async ensureConnected(server: McpServerRecord): Promise<string> {
    const serverId = server.managerServerId ?? server.id;
    await this.manager.waitForConnections({ timeout: 5_000 });
    const existing = this.manager.mcpConnections[serverId];
    if (
      existing &&
      (existing.connectionState === "ready" || existing.connectionState === "connected")
    ) {
      return serverId;
    }
    const check = this.guards.recordSubrequest(1);
    if (!check.allowed) {
      throw new Error(`subrequest_budget_exceeded_${check.limit}`);
    }
    const rawHeaders = JSON.parse(server.headersJson || "{}") as Record<string, string>;
    const resolvedHeaders = await this.vault.injectRecordForUrl(server.url, rawHeaders);
    const transportType = server.authMode === "sse" ? "sse" : "auto";
    await this.manager.registerServer(serverId, {
      url: server.url,
      name: server.name,
      transport: {
        type: transportType,
        headers: Object.keys(resolvedHeaders).length > 0 ? resolvedHeaders : undefined,
      },
    });
    const conn = await this.manager.connectToServer(serverId);
    if (conn.state === "failed") {
      throw new Error(`mcp_${server.name}_connect_failed: ${conn.error}`);
    }
    if (conn.state === "authenticating") {
      throw new Error(`mcp_${server.name}_auth_required: ${conn.authUrl}`);
    }
    await this.manager.discoverIfConnected(serverId);
    return serverId;
  }

  async discoverTools(serverName: string, force = false): Promise<McpToolDef[]> {
    if (!force && this.toolCache.has(serverName)) {
      return this.toolCache.get(serverName)!;
    }
    const server = this.getServer(serverName);
    if (!server) {
      throw new Error(`mcp_server_not_found:${serverName}`);
    }
    const serverId = await this.ensureConnected(server);
    if (force) {
      await this.manager.discoverIfConnected(serverId);
    }
    const list = this.manager.listTools().filter((t) => t.serverId === serverId);
    const tools: McpToolDef[] = list.map((t) => ({
      serverName,
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    }));
    this.toolCache.set(serverName, tools);
    return tools;
  }

  async isToolReadOnly(serverName: string, toolName: string): Promise<boolean> {
    const server = this.getServer(serverName);
    if (!server) return false;
    const serverId = await this.ensureConnected(server);
    const tool = this.manager
      .listTools()
      .find((t) => t.serverId === serverId && t.name === toolName);
    return tool?.annotations?.readOnlyHint === true;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const server = this.getServer(serverName);
    if (!server) {
      throw new Error(`mcp_server_not_found:${serverName}`);
    }
    const check = this.guards.recordSubrequest(1);
    if (!check.allowed) {
      throw new Error(`subrequest_budget_exceeded_${check.limit}`);
    }
    const serverId = await this.ensureConnected(server);
    const result = await this.manager.callTool({ serverId, name: toolName, arguments: args });
    const serialized = typeof result === "string" ? result : JSON.stringify(result);
    const safe = await this.vault.redact(serialized);
    try {
      return JSON.parse(safe);
    } catch {
      return safe;
    }
  }
}
