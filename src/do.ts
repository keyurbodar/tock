import { DurableObject } from "cloudflare:workers";
import { Lifecycle } from "agents/lifecycle";
import { Scheduler } from "agents/schedules";
import { PiHarness, ROOT_SESSION } from "agents/harness/pi";
import { createRegistry, Harness, type ConversationWatch } from "@earendil-works/pi-durable";
import type { Models } from "@earendil-works/pi-ai";
import { ensureSchema } from "./db/schema.js";
import { SettingsStore } from "./core/settings.js";
import { Vault } from "./core/vault.js";
import { UnifiedMemory } from "./core/memory.js";
import { ExecutionGuards } from "./core/guards.js";
import { McpHub } from "./core/mcp.js";
import { SubagentPool } from "./core/subagents.js";
import { RoutineStore, sha256Hex, type RoutineInput } from "./core/routines.js";
import { PushNotifier } from "./core/push.js";
import { buildModels, parseModelSpec, resolveModel } from "./core/models.js";
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
  private readonly push: PushNotifier;
  private readonly models: Models;
  private readonly activeWatches = new Map<string, ConversationWatch>();
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
        routines: this.routines,
        djs: this.djs,
        notifyOwner: (title, body) => this.notifyOwner(title, body),
        scheduleFollowup: (delay, note, sid) => this.scheduleFollowup(delay, note, sid)
      });
      registry.install(ext);
      return Harness.open(storage, { models: this.models, registry, onWake }, context);
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
    this.mcp = new McpHub(ctx.storage, this.vault, this.guards);
    this.subagents = new SubagentPool(this.settingsStore);
    this.routines = new RoutineStore(ctx.storage.sql, this.scheduler);
    this.push = new PushNotifier(ctx.storage.sql, this.vault, this.guards);
    this.models = buildModels(this.vault);
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
    if (this.mcp.isOAuthCallback(request)) {
      return this.mcp.handleOAuthCallback(request);
    }
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const owner = request.headers.get("x-tock-owner") ?? "owner";
      const sessionId = new URL(request.url).searchParams.get("session") ?? ROOT_SESSION;
      const attachment: WsAttachment = { cursor: this.eventSeq, sessionId, owner };
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      await this.ensureSessionWatch(sessionId);
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
      const data = await this.dispatchFrame(ws, frame);
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

  async webSocketClose(): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) {
      for (const watch of this.activeWatches.values()) {
        watch.stop();
      }
      this.activeWatches.clear();
    }
  }

  private async ensureSessionWatch(sessionId: string): Promise<void> {
    if (this.activeWatches.has(sessionId)) return;
    const watch = await this.harness.session(sessionId).watch();
    this.activeWatches.set(sessionId, watch);
    watch.start(async (call) => {
      if (call.kind === "value") {
        this.broadcastSession(sessionId, "session.delta", {
          sessionId,
          ops: call.ops,
          value: call.value
        });
      } else {
        this.broadcastSession(sessionId, "session.error", {
          sessionId,
          error: String(call.error)
        });
      }
    });
  }

  private async dispatchFrame(ws: WebSocket, frame: ClientFrame): Promise<unknown> {
    switch (frame.type) {
      case "ping":
        return { ts: Date.now() };
      case "chat.subscribe": {
        const sessionId = frame.sessionId ?? ROOT_SESSION;
        const att = ws.deserializeAttachment() as WsAttachment | null;
        if (att) {
          att.sessionId = sessionId;
          ws.serializeAttachment(att);
        }
        await this.ensureSessionWatch(sessionId);
        return { sessionId, subscribed: true };
      }
      case "chat.send": {
        const sessionId = frame.sessionId ?? ROOT_SESSION;
        await this.syncSessionModel(sessionId);
        await this.ensureSessionWatch(sessionId);
        const receipt = await this.harness.submit(frame.text, {
          session: sessionId,
          operationId: frame.operationId
        });
        await this.scheduler.set(300, "consolidateMemory", { sessionId }, { idempotent: true });
        this.broadcastSession(sessionId, "chat.accepted", receipt);
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
        await this.syncSessionModel(session.id);
        return { id: session.id };
      }
      case "session.messages":
        return await this.harness.messages({ session: frame.sessionId ?? ROOT_SESSION });
      case "settings.get":
        return this.settingsStore.get();
      case "settings.update":
        return await this.updateSettings(frame.patch);
      case "models.list":
        return this.listAvailableModels(frame.provider);
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
        return this.mcp.upsertServer(frame.name, frame.url, frame.headers, frame.authMode);
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
      case "push.subscribe":
        return this.push.subscribe(frame.endpoint, frame.p256dh, frame.auth);
      case "push.unsubscribe":
        return { deleted: this.push.unsubscribe(frame.endpoint) };
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

  private async syncSessionModel(sessionId: string): Promise<void> {
    const parsed = parseModelSpec(this.settingsStore.get().model);
    if (!parsed) return;
    await this.harness.session(sessionId).setModel(parsed);
  }

  listAvailableModels(provider?: string): Array<{ provider: string; id: string; name: string }> {
    const providers = provider ? [provider] : this.models.getProviders().map((p) => p.id);
    const out: Array<{ provider: string; id: string; name: string }> = [];
    for (const pid of providers) {
      for (const m of this.models.getModels(pid)) {
        out.push({ provider: m.provider, id: m.id, name: m.name });
      }
    }
    return out;
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
    const updated = this.settingsStore.update(patch);
    if (patch.model) {
      const parsed = parseModelSpec(patch.model);
      if (parsed) {
        await this.harness.session(ROOT_SESSION).setModel(parsed);
      }
    }
    return updated;
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

  async upsertMcpServer(
    name: string,
    url: string,
    headers: Record<string, string> = {},
    authMode: "headers" | "oauth" = "headers"
  ) {
    await this.lifecycle.start();
    return this.mcp.upsertServer(name, url, headers, authMode);
  }

  async connectMcpOAuth(name: string, url: string, callbackHost: string) {
    await this.lifecycle.start();
    return this.mcp.connectOAuth(name, url, callbackHost);
  }

  async upsertRoutine(input: RoutineInput) {
    await this.lifecycle.start();
    return this.routines.upsert(input);
  }

  async triggerRoutineNow(routineId: string): Promise<{ ran: boolean; skippedUnchanged: boolean; wokeModel: boolean }> {
    await this.lifecycle.start();
    return this.executeRoutine(routineId);
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

  async chatPrompt(text: string, sessionId = ROOT_SESSION): Promise<{ status: string; text?: string; reason?: string }> {
    await this.lifecycle.start();
    await this.syncSessionModel(sessionId);
    const res = await this.harness.prompt(text, { session: sessionId });
    return { status: res.status, text: res.text, reason: res.reason };
  }

  async handleWebhook(hookId: string, token: string, payload: unknown): Promise<{ accepted: boolean; reason?: string }> {
    await this.lifecycle.start();
    const expected = await this.vault.resolve(`webhook_${hookId}`);
    if (!expected || expected !== token) {
      return { accepted: false, reason: "invalid_webhook_token" };
    }
    const text = `[webhook:${hookId}] ${JSON.stringify(payload).slice(0, 4000)}`;
    await this.syncSessionModel(ROOT_SESSION);
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
    await this.syncSessionModel(sessionId);
    await this.harness.submit(`[scheduled-followup] ${note}`, {
      session: sessionId,
      entry: { kind: "tock.followup", data: { note } }
    });
  }

  private async executeRoutine(
    routineId: string
  ): Promise<{ ran: boolean; skippedUnchanged: boolean; wokeModel: boolean }> {
    this.guards.resetSlice();
    const routine = this.routines.get(routineId);
    if (!routine || !routine.enabled) {
      return { ran: false, skippedUnchanged: false, wokeModel: false };
    }

    let checkPayload = "";
    if (routine.checkScript) {
      const checkRes = await this.djs.runCode(routine.checkScript);
      if (!checkRes.ok) {
        return { ran: true, skippedUnchanged: false, wokeModel: false };
      }
      checkPayload = checkRes.valueJson ?? "";
      const hash = await sha256Hex(checkPayload);
      const { changed, isFirstRun } = this.routines.markRun(routine.id, hash);
      if (routine.quietIfUnchanged && (!changed || isFirstRun)) {
        return { ran: true, skippedUnchanged: true, wokeModel: false };
      }
    } else {
      const hash = await sha256Hex(`${routine.id}:${routine.prompt}:${Math.floor(Date.now() / 60_000)}`);
      const { changed } = this.routines.markRun(routine.id, hash);
      if (routine.quietIfUnchanged && !changed) {
        return { ran: true, skippedUnchanged: true, wokeModel: false };
      }
    }

    const bgModel = parseModelSpec(this.settingsStore.get().backgroundModel || this.settingsStore.get().model);
    if (bgModel) {
      await this.harness.session(ROOT_SESSION).setModel(bgModel);
    }
    const promptBody = checkPayload
      ? `[routine:${routine.name}] Change detected.\nCheck output: ${checkPayload.slice(0, 3000)}\nInstruction: ${routine.prompt}`
      : `[routine:${routine.name}] ${routine.prompt}`;
    await this.harness.submit(promptBody, {
      session: ROOT_SESSION,
      entry: { kind: "tock.routine", data: { routineId: routine.id, name: routine.name } }
    });
    return { ran: true, skippedUnchanged: false, wokeModel: true };
  }

  private async consolidateSessionMemory(sessionId: string): Promise<void> {
    const entries = await this.harness.messages({ session: sessionId });
    if (entries.length === 0) return;
    const cfg = this.settingsStore.get();
    const model = resolveModel(this.models, cfg.backgroundModel || cfg.model);
    if (model) {
      const transcriptText = entries
        .slice(-20)
        .map((e) => JSON.stringify(e))
        .join("\n");
      try {
        await this.memory.consolidateWithModel(this.models, model, sessionId, transcriptText);
        return;
      } catch {
        return;
      }
    }
    this.memory.applyBatch({
      addItems: [{ kind: "summary", content: `Session ${sessionId} updated (${entries.length} entries).`, sourceSessionId: sessionId }]
    });
  }

  private async notifyOwner(title: string, body: string): Promise<void> {
    this.broadcast("notification.push", { title, body, ts: Date.now() });
    await this.push.deliverOffline(title, body);
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
    const encoded = JSON.stringify({ type: "event", seq, event, payload } satisfies ServerFrame);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(encoded);
      } catch {
        continue;
      }
    }
  }

  private broadcastSession(sessionId: string, event: string, payload: unknown): void {
    const seq = ++this.eventSeq;
    const encoded = JSON.stringify({ type: "event", seq, event, payload } satisfies ServerFrame);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (att && att.sessionId !== sessionId) continue;
      try {
        ws.send(encoded);
      } catch {
        continue;
      }
    }
  }
}
