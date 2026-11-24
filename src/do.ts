import { DurableObject } from "cloudflare:workers";
import { Lifecycle } from "agents/lifecycle";
import { Scheduler } from "agents/schedules";
import { PiHarness, ROOT_SESSION } from "agents/harness/pi";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { ensureSchema } from "./db/schema.js";
import { SettingsStore } from "./core/settings.js";
import { Vault } from "./core/vault.js";
import { UnifiedMemory } from "./core/memory.js";
import { ExecutionGuards } from "./core/guards.js";
import { McpHub } from "./core/mcp.js";
import { SubagentPool } from "./core/subagents.js";
import { RoutineStore, sha256Hex } from "./core/routines.js";
import { buildModels } from "./core/models.js";
import { createTockExtension } from "./core/tools.js";
import { DjsRuntime, type DjsRunResult } from "./dev/djs.js";
import type { ClientFrame, Env, OwnerSettings, ServerFrame, WsAttachment } from "./types.js";

export class TockDO extends DurableObject<Env> {
  private readonly settingsStore: SettingsStore;
  private readonly vault: Vault;
  private readonly memory: UnifiedMemory;
  private readonly guards: ExecutionGuards;
  private readonly mcp: McpHub;
  private readonly subagents: SubagentPool;
  private readonly djs: DjsRuntime;
  private readonly routines: RoutineStore;
  private eventSeq = 0;

  readonly scheduler = new Scheduler({
    callbacks: {
      runRoutine: async (payload: { routineId: string }) => {
        await this.executeRoutine(payload.routineId);
      },
      runFollowup: async (payload: { sessionId: string; note: string }) => {
        await this.executeFollowup(payload.sessionId, payload.note);
      },
      consolidateMemory: async (payload: { sessionId: string }) => {
        await this.consolidateSessionMemory(payload.sessionId);
      }
    }
  });

  readonly harness = new PiHarness({
    harness: async ({ storage, context, onWake }) => {
      const registry = createRegistry();
      const ext = createTockExtension({
        memory: this.memory,
        vault: this.vault,
        guards: this.guards,
        mcp: this.mcp,
        subagents: this.subagents,
        settings: this.settingsStore,
        djs: this.djs,
        notifyOwner: (title, body) => this.notifyOwner(title, body),
        scheduleFollowup: (delay, note, sid) => this.scheduleFollowup(delay, note, sid)
      });
      registry.install(ext);
      const models = buildModels(this.vault);
      return Harness.open(storage, { models, registry, onWake }, context);
    }
  });

  readonly lifecycle = Lifecycle.install(this).use(this.scheduler).use(this.harness);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ensureSchema(ctx.storage.sql, env.DEFAULT_TIMEZONE ?? "UTC");
    this.settingsStore = new SettingsStore(ctx.storage.sql);
    this.vault = new Vault(ctx.storage.sql, env.VAULT_MASTER_KEY ?? "");
    this.memory = new UnifiedMemory(ctx.storage);
    this.guards = new ExecutionGuards();
    this.mcp = new McpHub(ctx.storage.sql, this.vault, this.guards);
    this.subagents = new SubagentPool(this.settingsStore);
    this.routines = new RoutineStore(ctx.storage.sql, this.scheduler);
    this.djs = new DjsRuntime(ctx.storage.sql, {
      vault: this.vault,
      memory: this.memory,
      guards: this.guards,
      notifyOwner: (title, body) => this.notifyOwner(title, body),
      scheduleFollowup: (delay, note) => this.scheduleFollowup(delay, note),
      callMcpTool: (server, tool, args) => this.mcp.callTool(server, tool, args)
    });
  }

  async onRequest(request: Request): Promise<Response> {
    this.guards.resetSlice();
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const owner = request.headers.get("x-tock-owner") ?? "owner";
      const sessionId = new URL(request.url).searchParams.get("session") ?? ROOT_SESSION;
      const attachment: WsAttachment = { cursor: this.eventSeq, sessionId, owner };
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json({ ok: true, service: "tock" });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.lifecycle.start();
    this.guards.resetSlice();
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw) as ClientFrame;
    } catch {
      this.sendWs(ws, { type: "error", code: "invalid_json", message: "Malformed JSON frame" });
      return;
    }
    try {
      const data = await this.dispatchFrame(frame);
      if (frame.type === "ping") {
        this.sendWs(ws, { id: frame.id, type: "pong", ts: Date.now() });
      } else {
        this.sendWs(ws, { id: frame.id, type: "ok", data });
      }
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (att) {
        att.cursor = this.eventSeq;
        ws.serializeAttachment(att);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendWs(ws, { id: frame.id, type: "error", code: "command_failed", message: msg });
    }
  }

  private async dispatchFrame(frame: ClientFrame): Promise<unknown> {
    switch (frame.type) {
      case "ping":
        return { ts: Date.now() };
      case "chat.send": {
        const sessionId = frame.sessionId ?? ROOT_SESSION;
        const receipt = await this.harness.submit(frame.text, {
          session: sessionId,
          operationId: frame.operationId
        });
        await this.scheduler.set(300, "consolidateMemory", { sessionId }, { idempotent: true });
        this.broadcast("chat.accepted", receipt);
        return receipt;
      }
      case "chat.abort":
        return {
          aborted: await this.harness.abort({
            session: frame.sessionId ?? ROOT_SESSION,
            operationId: frame.operationId
          })
        };
      case "session.list":
        return await this.harness.sessions.list();
      case "session.create": {
        const session = await this.harness.sessions.create();
        return { id: session.id };
      }
      case "session.messages":
        return await this.harness.messages({ session: frame.sessionId ?? ROOT_SESSION });
      case "settings.get":
        return this.settingsStore.get();
      case "settings.update":
        return this.settingsStore.update(frame.patch);
      case "vault.list":
        return this.vault.listMeta();
      case "vault.set":
        await this.vault.set(frame.name, frame.value, frame.description, frame.scopes);
        return { name: frame.name, saved: true };
      case "vault.delete":
        return { deleted: this.vault.delete(frame.name) };
      case "mcp.list":
        return this.mcp.listServers();
      case "mcp.upsert":
        return this.mcp.upsertServer(frame.name, frame.url, frame.headers);
      case "mcp.delete":
        return { deleted: this.mcp.deleteServer(frame.idOrName) };
      case "routine.list":
        return this.routines.list();
      case "routine.upsert":
        return await this.routines.upsert(frame.routine);
      case "routine.delete":
        return { deleted: await this.routines.delete(frame.routineId) };
      case "plugin.list":
        return this.djs.listPlugins();
      case "plugin.upsert":
        return this.djs.upsertPlugin(frame.plugin);
      case "plugin.delete":
        return { deleted: this.djs.deletePlugin(frame.pluginId) };
      case "memory.get":
        return {
          core: this.memory.getCore(),
          openItems: this.memory.listOpenItems("open"),
          recent: this.memory.recent(10)
        };
      case "memory.search":
        return this.memory.search(frame.query, frame.limit ?? 8);
    }
  }

  async getHealth(): Promise<{ ok: true; settings: OwnerSettings; activeSubagents: number; mcpServers: number }> {
    await this.lifecycle.start();
    return {
      ok: true,
      settings: this.settingsStore.get(),
      activeSubagents: this.subagents.runningCount,
      mcpServers: this.mcp.listServers().length
    };
  }

  async updateSettings(patch: Partial<Omit<OwnerSettings, "updatedAt">>): Promise<OwnerSettings> {
    await this.lifecycle.start();
    return this.settingsStore.update(patch);
  }

  async setSecret(name: string, value: string, description = "", scopes = ""): Promise<{ saved: true }> {
    await this.lifecycle.start();
    await this.vault.set(name, value, description, scopes);
    return { saved: true };
  }

  async listSecrets() {
    await this.lifecycle.start();
    return this.vault.listMeta();
  }

  async upsertMcpServer(name: string, url: string, headers: Record<string, string> = {}) {
    await this.lifecycle.start();
    return this.mcp.upsertServer(name, url, headers);
  }

  async runCodemode(code: string, params: Record<string, unknown> = {}): Promise<DjsRunResult> {
    await this.lifecycle.start();
    this.guards.resetSlice();
    return this.djs.runCode(code, params);
  }

  async writeMemory(batch: Parameters<UnifiedMemory["applyBatch"]>[0]) {
    await this.lifecycle.start();
    return this.memory.applyBatch(batch);
  }

  async searchMemory(query: string, limit = 6) {
    await this.lifecycle.start();
    return this.memory.search(query, limit);
  }

  async renderAutoContext(query: string): Promise<string> {
    await this.lifecycle.start();
    return this.memory.renderAutoContext(query);
  }

  async handleWebhook(hookId: string, token: string, payload: unknown): Promise<{ accepted: boolean; reason?: string }> {
    await this.lifecycle.start();
    const expected = await this.vault.resolve(`webhook_${hookId}`);
    if (!expected || expected !== token) {
      return { accepted: false, reason: "invalid_webhook_token" };
    }
    const text = `[webhook:${hookId}] ${JSON.stringify(payload).slice(0, 4000)}`;
    await this.harness.submit(text, {
      session: ROOT_SESSION,
      entry: { kind: "tock.webhook", data: { hookId } }
    });
    return { accepted: true };
  }

  private async scheduleFollowup(delaySeconds: number, note: string, sessionId = ROOT_SESSION): Promise<string> {
    const clamped = Math.max(5, Math.min(86_400, Math.floor(delaySeconds)));
    const job = await this.scheduler.set(clamped, "runFollowup", { sessionId, note });
    return job.id;
  }

  private async executeFollowup(sessionId: string, note: string): Promise<void> {
    this.guards.resetSlice();
    await this.harness.submit(`[scheduled-followup] ${note}`, {
      session: sessionId,
      entry: { kind: "tock.followup", data: { note } }
    });
  }

  private async executeRoutine(routineId: string): Promise<void> {
    this.guards.resetSlice();
    const routine = this.routines.get(routineId);
    if (!routine || !routine.enabled) return;
    const hash = await sha256Hex(`${routine.id}:${routine.prompt}:${Math.floor(Date.now() / 60_000)}`);
    const { changed } = this.routines.markRun(routine.id, hash);
    if (routine.quietIfUnchanged && !changed) return;
    await this.harness.submit(`[routine:${routine.name}] ${routine.prompt}`, {
      session: ROOT_SESSION,
      entry: { kind: "tock.routine", data: { routineId: routine.id, name: routine.name } }
    });
  }

  private async consolidateSessionMemory(sessionId: string): Promise<void> {
    const entries = await this.harness.messages({ session: sessionId });
    if (entries.length === 0) return;
    const latest = entries[entries.length - 1];
    if (!latest) return;
    const summary = `Active session ${sessionId} updated (${entries.length} entries).`;
    this.memory.applyBatch({
      addItems: [{ kind: "summary", content: summary, sourceSessionId: sessionId }]
    });
  }

  private async notifyOwner(title: string, body: string): Promise<void> {
    this.broadcast("notification.push", { title, body, ts: Date.now() });
  }

  private sendWs(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      return;
    }
  }

  private broadcast(event: string, payload: unknown): void {
    const seq = ++this.eventSeq;
    const frame: ServerFrame = { type: "event", seq, event, payload };
    const encoded = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(encoded);
      } catch {
        continue;
      }
    }
  }
}
