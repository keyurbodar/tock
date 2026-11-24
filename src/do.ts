import { DurableObject } from "cloudflare:workers";
import { Lifecycle } from "agents/lifecycle";
import { Scheduler } from "agents/schedules";
import { PiHarness, ROOT_SESSION } from "agents/harness/pi";
import { summarizeEntries } from "./core/summary.js";
import { MCPClientManager } from "agents/mcp/client";
import { createRegistry, Harness, type ConversationWatch } from "@earendil-works/pi-durable";
import {
  getSupportedThinkingLevels,
  type CredentialStore,
  type Models,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { ensureSchema } from "./db/schema.js";
import { JournalStorage } from "./db/journal.js";
import { SettingsStore } from "./core/settings.js";
import { Vault } from "./core/vault.js";
import { UnifiedMemory } from "./core/memory.js";
import { ExecutionGuards } from "./core/guards.js";
import { McpHub, mcpServerView } from "./core/mcp.js";
import { SubagentPool } from "./core/subagents.js";
import { RoutineStore, sha256Hex, type RoutineInput } from "./core/routines.js";
import { PushNotifier } from "./core/push.js";
import { FileStore } from "./core/files.js";
import { SkillStore } from "./core/skills.js";
import { constantTimeEqual } from "./core/auth.js";
import { parseClientFrame } from "./core/schemas.js";
import { buildModels, parseModelSpec, resolveModel } from "./core/models.js";
import { createTockExtension } from "./core/tools.js";
import { DjsRuntime, type DjsRunResult } from "./dev/djs.js";
import type {
  ClientFrame,
  Env,
  FileMeta,
  OwnerSettings,
  ServerFrame,
  SkillRecord,
  ThinkingLevelOption,
  WsAttachment,
} from "./types.js";

const MAX_STORED_EVENTS = 200;

export class TockDO extends DurableObject<Env> {
  private readonly settingsStore: SettingsStore;
  private readonly vault: Vault;
  private readonly memory: UnifiedMemory;
  private readonly guards: ExecutionGuards;
  private readonly mcp: McpHub;
  private readonly subagents: SubagentPool;
  private readonly files: FileStore;
  private readonly skills: SkillStore;
  private readonly djs: DjsRuntime;
  private readonly routines: RoutineStore;
  private readonly push: PushNotifier;
  private readonly models: Models;
  private readonly credentials: CredentialStore;
  private readonly activeWatches = new Map<string, ConversationWatch>();
  private readonly lastUserQuery = new Map<string, string>();
  private readonly backgroundSessions = new Set<string>();

  readonly mcpManager = new MCPClientManager("tock", "0.1.0");

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
      },
    },
  });

  readonly harness = new PiHarness({
    storage: (doStorage) => JournalStorage.open(doStorage, BACKGROUND_CONTEXT),
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
        files: this.files,
        skills: this.skills,
        djs: this.djs,
        getLastUserQuery: (convId) => this.lastUserQuery.get(convId) ?? "",
        isBackgroundSession: (convId) => this.backgroundSessions.has(convId),
        notifyOwner: (title, body) => this.notifyOwner(title, body),
        scheduleFollowup: (delay, note, sid) => this.scheduleFollowup(delay, note, sid),
      });
      registry.install(ext);
      return Harness.open(storage, { models: this.models, registry, onWake }, context);
    },
  });

  readonly lifecycle = Lifecycle.install(this)
    .use(this.scheduler)
    .use(this.harness)
    .use(this.mcpManager);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ensureSchema(ctx.storage.sql, env.DEFAULT_TIMEZONE ?? "UTC");
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.settingsStore = new SettingsStore(ctx.storage.sql);
    this.vault = new Vault(ctx.storage.sql, env.VAULT_MASTER_KEY ?? "");
    this.memory = new UnifiedMemory(ctx.storage);
    this.guards = new ExecutionGuards();
    this.mcp = new McpHub(ctx.storage, this.vault, this.guards, this.mcpManager);
    this.subagents = new SubagentPool(ctx.storage.sql, this.settingsStore);
    this.files = new FileStore(ctx.storage.sql, env.FILES);
    this.skills = new SkillStore(ctx.storage.sql, this.guards);
    this.routines = new RoutineStore(ctx.storage.sql, this.scheduler);
    this.push = new PushNotifier(ctx.storage.sql, this.vault, this.guards, {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    });
    const built = buildModels(this.vault);
    this.models = built.models;
    this.credentials = built.credentials;
    this.djs = new DjsRuntime(ctx.storage.sql, {
      vault: this.vault,
      memory: this.memory,
      guards: this.guards,
      files: this.files,
      notifyOwner: (title, body) => this.notifyOwner(title, body),
      scheduleFollowup: (delay, note) => this.scheduleFollowup(delay, note),
      callMcpTool: (server, tool, args) => this.mcp.callTool(server, tool, args),
      isMcpToolReadOnly: (server, tool) => this.mcp.isToolReadOnly(server, tool),
    });
  }

  async onStart(): Promise<void> {
    await this.reattachSocketWatches();
  }

  override async fetch(request: Request): Promise<Response> {
    await this.lifecycle.start();
    return this.onRequest(request);
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
      const url = new URL(request.url);
      const sessionId = url.searchParams.get("session") ?? ROOT_SESSION;
      const rawCursor = url.searchParams.get("cursor");
      const cursorParam = rawCursor === null || rawCursor === "" ? Number.NaN : Number(rawCursor);
      const latestSeq = this.latestEventSeq();
      const cursor = Number.isInteger(cursorParam) && cursorParam >= 0 ? cursorParam : latestSeq;
      const attachment: WsAttachment = { cursor, sessionId, owner };
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      await this.ensureSessionWatch(sessionId);
      if (cursor < latestSeq) {
        this.replayEvents(server, sessionId, cursor);
      }
      if (rawCursor !== null && rawCursor !== "") {
        this.sendWs(server, {
          type: "event",
          seq: latestSeq,
          event: "session.snapshot",
          payload: { sessionId, messages: await this.harness.session(sessionId).messages() },
        });
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json({ ok: true, service: "tock" });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.lifecycle.start();
    await this.reattachSocketWatches();
    this.guards.resetSlice();
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.sendWs(ws, { type: "error", code: "invalid_json", message: "Malformed JSON frame" });
      return;
    }
    const validated = parseClientFrame(parsedJson);
    if (!validated.ok) {
      const id =
        parsedJson &&
        typeof parsedJson === "object" &&
        "id" in parsedJson &&
        typeof parsedJson.id === "string"
          ? parsedJson.id
          : undefined;
      this.sendWs(ws, { id, type: "error", code: "invalid_frame", message: validated.error });
      return;
    }
    const frame = validated.frame;
    try {
      const data = await this.dispatchFrame(ws, frame);
      if (frame.type === "ping") {
        this.sendWs(ws, { id: frame.id, type: "pong", ts: Date.now() });
      } else {
        this.sendWs(ws, { id: frame.id, type: "ok", data });
      }
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (att) {
        att.cursor = this.latestEventSeq();
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

  private async reattachSocketWatches(): Promise<void> {
    const sessionIds = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      sessionIds.add(att?.sessionId ?? ROOT_SESSION);
    }
    for (const sid of sessionIds) {
      try {
        await this.ensureSessionWatch(sid);
      } catch {
        continue;
      }
    }
  }

  private async ensureSessionWatch(sessionId: string): Promise<void> {
    if (this.activeWatches.has(sessionId)) return;
    const watch = await this.harness.session(sessionId).watch();
    this.activeWatches.set(sessionId, watch);
    watch.start(async (call) => {
      if (call.kind === "value") {
        this.broadcastSession(
          sessionId,
          "session.delta",
          { sessionId, ops: call.ops, value: call.value },
          false,
        );
      } else {
        this.broadcastSession(sessionId, "session.error", { sessionId, error: String(call.error) });
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
        const replayFrom = frame.cursor ?? att?.cursor;
        if (att) {
          att.sessionId = sessionId;
          ws.serializeAttachment(att);
        }
        await this.ensureSessionWatch(sessionId);
        const replayed =
          replayFrom !== undefined ? this.replayEvents(ws, sessionId, replayFrom) : 0;
        return {
          sessionId,
          subscribed: true,
          replayed,
          cursor: this.latestEventSeq(),
          messages: await this.harness.session(sessionId).messages(),
        };
      }
      case "session.configure":
        return await this.configureSession(frame.sessionId ?? ROOT_SESSION, {
          model: frame.model,
          thinkingLevel: frame.thinkingLevel,
        });
      case "chat.send": {
        const sessionId = frame.sessionId ?? ROOT_SESSION;
        this.backgroundSessions.delete(sessionId);
        this.lastUserQuery.set(sessionId, frame.text);
        if (frame.model || frame.thinkingLevel) {
          await this.configureSession(sessionId, {
            model: frame.model,
            thinkingLevel: frame.thinkingLevel,
          });
        } else {
          await this.syncSessionModel(sessionId);
        }
        await this.ensureSessionWatch(sessionId);
        const receipt = await this.harness.submit(frame.text, {
          session: sessionId,
          operationId: frame.operationId,
        });
        await this.scheduler.set(300, "consolidateMemory", { sessionId }, { idempotent: true });
        this.broadcastSession(sessionId, "chat.accepted", receipt, false);
        return receipt;
      }
      case "chat.abort":
        return {
          aborted: await this.harness.abort({
            session: frame.sessionId ?? ROOT_SESSION,
            operationId: frame.operationId,
          }),
        };
      case "session.list":
        return await this.listSessionSummaries();
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
      case "models.refresh":
        return await this.refreshModels(frame.providers);
      case "vault.list":
        return this.vault.listMeta();
      case "vault.set":
        await this.vault.set(
          frame.name,
          frame.value,
          frame.description,
          frame.scopes,
          frame.origin,
        );
        return { name: frame.name, saved: true };
      case "vault.delete":
        return { deleted: this.vault.delete(frame.name) };
      case "mcp.list":
        return this.mcp.listServers().map(mcpServerView);
      case "mcp.upsert":
        return mcpServerView(
          await this.mcp.upsertServer(frame.name, frame.url, frame.headers, frame.authMode),
        );
      case "mcp.test":
        return mcpServerView(await this.mcp.checkServer(frame.idOrName));
      case "mcp.enable":
        return mcpServerView(await this.mcp.setEnabled(frame.idOrName, frame.enabled));
      case "mcp.delete":
        return { deleted: await this.mcp.deleteServer(frame.idOrName) };
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
      case "skill.list":
        return this.skills.list();
      case "skill.upsert":
        return this.skills.upsert({
          name: frame.name,
          description: frame.description,
          bodyMd: frame.bodyMd,
          files: frame.files,
        });
      case "skill.import":
        return await this.skills.importSource(frame.source);
      case "skill.delete":
        return { deleted: this.skills.delete(frame.name) };
      case "file.list":
        return this.files.list(frame.sessionId);
      case "file.delete":
        return { deleted: await this.files.delete(frame.fileId) };
      case "push.subscribe":
        return this.push.subscribe(frame.endpoint, frame.p256dh, frame.auth, frame.label);
      case "push.list":
        return { devices: this.push.listDevices(frame.endpoint) };
      case "push.unsubscribe":
        return { deleted: this.push.unsubscribe(frame.endpoint) };
      case "memory.get":
        return {
          core: this.memory.getCore(),
          openItems: this.memory.listOpenItems("open"),
          recent: this.memory.recent(10),
        };
      case "memory.search":
        return this.memory.search(frame.query, frame.limit ?? 8);
    }
  }

  private async listSessionSummaries() {
    const sessions = await this.harness.sessions.list();
    return await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        ...summarizeEntries(await this.harness.session(session.id).messages()),
      })),
    );
  }

  private async syncSessionModel(sessionId: string): Promise<void> {
    const parsed = parseModelSpec(this.settingsStore.get().model);
    if (!parsed) return;
    await this.harness.session(sessionId).setModel(parsed);
  }

  listAvailableModels(provider?: string): Array<{
    provider: string;
    id: string;
    name: string;
    reasoning: boolean;
    thinkingLevels: ModelThinkingLevel[];
    contextWindow: number;
    cost: { input: number; output: number };
  }> {
    const providers = provider ? [provider] : this.models.getProviders().map((p) => p.id);
    const out: Array<{
      provider: string;
      id: string;
      name: string;
      reasoning: boolean;
      thinkingLevels: ModelThinkingLevel[];
      contextWindow: number;
      cost: { input: number; output: number };
    }> = [];
    for (const pid of providers) {
      for (const m of this.models.getModels(pid)) {
        out.push({
          provider: m.provider,
          id: m.id,
          name: m.name,
          reasoning: m.reasoning,
          thinkingLevels: getSupportedThinkingLevels(m),
          contextWindow: m.contextWindow,
          cost: { input: m.cost.input, output: m.cost.output },
        });
      }
    }
    return out;
  }

  async refreshModels(providers?: string[]): Promise<{ refreshed: boolean; errorCount: number }> {
    await this.lifecycle.start();
    const res = await this.models.refresh({ providers, force: true });
    return { refreshed: !res.aborted, errorCount: res.errors.size };
  }

  async listProviders(): Promise<Array<{ id: string; name: string; configured: boolean }>> {
    await this.lifecycle.start();
    const creds = new Set((await this.credentials.list()).map((c) => c.providerId));
    return this.models.getProviders().map((p) => ({
      id: p.id,
      name: p.name,
      configured: creds.has(p.id),
    }));
  }

  async setProviderCredential(
    providerId: string,
    apiKey: string,
  ): Promise<{ saved: true; providerId: string }> {
    await this.lifecycle.start();
    await this.credentials.modify(providerId, async () => ({ type: "api_key", key: apiKey }));
    return { saved: true, providerId };
  }

  async deleteProviderCredential(
    providerId: string,
  ): Promise<{ deleted: true; providerId: string }> {
    await this.lifecycle.start();
    await this.credentials.delete(providerId);
    return { deleted: true, providerId };
  }

  async configureSession(
    sessionId: string,
    opts: { model?: string; thinkingLevel?: ThinkingLevelOption },
  ): Promise<{
    sessionId: string;
    model?: { provider: string; id: string };
    thinkingLevel?: ThinkingLevelOption;
  }> {
    await this.lifecycle.start();
    const conv = await this.harness.conversation(sessionId);
    const parsedModel = opts.model ? parseModelSpec(opts.model) : undefined;
    if (opts.model && !parsedModel) {
      throw new Error("invalid_model_spec");
    }
    await conv.configure(
      {
        ...(parsedModel
          ? { model: { provider: parsedModel.provider, modelId: parsedModel.id } }
          : {}),
        ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
      },
      BACKGROUND_CONTEXT,
    );
    return { sessionId, model: parsedModel ?? undefined, thinkingLevel: opts.thinkingLevel };
  }

  async getHealth(): Promise<{
    ok: true;
    settings: OwnerSettings;
    activeSubagents: number;
    mcpServers: number;
    skills: number;
    files: number;
    pushPublicKey: string | null;
  }> {
    await this.lifecycle.start();
    return {
      ok: true,
      settings: this.settingsStore.get(),
      activeSubagents: this.subagents.runningCount,
      mcpServers: this.mcp.listServers().length,
      skills: this.skills.list().length,
      files: this.files.list().length,
      pushPublicKey: this.env.VAPID_PUBLIC_KEY ?? null,
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

  async setSecret(
    name: string,
    value: string,
    description = "",
    scopes = "",
    origin = "",
  ): Promise<{ saved: true }> {
    await this.lifecycle.start();
    await this.vault.set(name, value, description, scopes, origin);
    return { saved: true };
  }

  async listSecrets() {
    await this.lifecycle.start();
    return this.vault.listMeta();
  }

  async uploadFile(
    name: string,
    mime: string,
    bytes: Uint8Array,
    sessionId?: string,
  ): Promise<FileMeta> {
    await this.lifecycle.start();
    return this.files.put(name, mime, bytes, sessionId ?? null);
  }

  async getFile(id: string): Promise<{ meta: FileMeta; bytes: Uint8Array } | null> {
    await this.lifecycle.start();
    return this.files.get(id);
  }

  async listFiles(sessionId?: string): Promise<FileMeta[]> {
    await this.lifecycle.start();
    return this.files.list(sessionId);
  }

  async upsertSkill(input: {
    name?: string;
    description?: string;
    bodyMd: string;
    files?: Record<string, string>;
  }): Promise<SkillRecord> {
    await this.lifecycle.start();
    return this.skills.upsert(input);
  }

  async importSkill(source: string): Promise<SkillRecord[]> {
    await this.lifecycle.start();
    return this.skills.importSource(source);
  }

  async listSkills(): Promise<SkillRecord[]> {
    await this.lifecycle.start();
    return this.skills.list();
  }

  async upsertPlugin(plugin: Parameters<DjsRuntime["upsertPlugin"]>[0]) {
    await this.lifecycle.start();
    return this.djs.upsertPlugin(plugin);
  }

  async upsertMcpServer(
    name: string,
    url: string,
    headers: Record<string, string> = {},
    authMode: "headers" | "oauth" | "sse" = "headers",
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

  async triggerRoutineNow(
    routineId: string,
  ): Promise<{ ran: boolean; skippedUnchanged: boolean; wokeModel: boolean }> {
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

  async listMemoryRevisions(limit = 20) {
    await this.lifecycle.start();
    return this.memory.listCoreRevisions(limit);
  }

  async restoreMemoryRevision(revisionId: number) {
    await this.lifecycle.start();
    return this.memory.restoreCoreRevision(revisionId);
  }

  async chatPrompt(
    text: string,
    sessionId = ROOT_SESSION,
    opts?: { model?: string; thinkingLevel?: ThinkingLevelOption },
  ): Promise<{ status: string; text?: string; reason?: string }> {
    await this.lifecycle.start();
    this.backgroundSessions.delete(sessionId);
    this.lastUserQuery.set(sessionId, text);
    if (opts?.model || opts?.thinkingLevel) {
      await this.configureSession(sessionId, opts);
    } else {
      await this.syncSessionModel(sessionId);
    }
    const res = await this.harness.prompt(text, { session: sessionId });
    if (res.status !== "done" && (res.reason === "model_error" || res.reason === "no_model")) {
      const fallback = parseModelSpec(this.settingsStore.get().fallbackModel);
      if (fallback && this.settingsStore.get().fallbackModel !== opts?.model) {
        const session = this.harness.session(sessionId);
        await session.setModel(fallback);
        const receipt = await session.continue();
        const retry = await session.wait(receipt.operationId);
        return { status: retry.status, text: retry.text, reason: retry.reason };
      }
    }
    return { status: res.status, text: res.text, reason: res.reason };
  }

  async handleWebhook(
    hookId: string,
    token: string,
    payload: unknown,
    filterPlugin?: string,
  ): Promise<{ accepted: boolean; filtered?: boolean; reason?: string }> {
    await this.lifecycle.start();
    const expected = await this.vault.resolve(`webhook_${hookId}`);
    if (!expected || !constantTimeEqual(expected, token)) {
      return { accepted: false, reason: "invalid_webhook_token" };
    }
    let summary: string | undefined;
    if (filterPlugin && this.settingsStore.get().devMode) {
      const verdict = await this.djs.runWebhookFilter(filterPlugin, payload);
      if (!verdict.pass) {
        return { accepted: true, filtered: true };
      }
      summary = verdict.summary;
    }
    const text = summary
      ? `[webhook:${hookId}] ${summary}`
      : `[webhook:${hookId}] ${JSON.stringify(payload).slice(0, 4000)}`;
    this.backgroundSessions.add(ROOT_SESSION);
    this.lastUserQuery.set(ROOT_SESSION, text);
    await this.syncSessionModel(ROOT_SESSION);
    await this.harness.submit(text, {
      session: ROOT_SESSION,
      entry: { kind: "tock.webhook", data: { hookId } },
    });
    return { accepted: true, filtered: false };
  }

  async handleEmail(
    from: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<{ accepted: boolean }> {
    await this.lifecycle.start();
    this.backgroundSessions.add(ROOT_SESSION);
    const text = `[inbound-email]\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${body.slice(0, 8000)}`;
    this.lastUserQuery.set(ROOT_SESSION, `${subject} ${body.slice(0, 200)}`);
    await this.syncSessionModel(ROOT_SESSION);
    await this.harness.submit(text, {
      session: ROOT_SESSION,
      entry: { kind: "tock.email", data: { from, to, subject } },
    });
    return { accepted: true };
  }

  private async scheduleFollowup(
    delaySeconds: number,
    note: string,
    sessionId = ROOT_SESSION,
  ): Promise<string> {
    const clamped = Math.max(5, Math.min(86_400, Math.floor(delaySeconds)));
    const job = await this.scheduler.set(clamped, "runFollowup", { sessionId, note });
    return job.id;
  }

  private async executeFollowup(sessionId: string, note: string): Promise<void> {
    this.guards.resetSlice();
    this.backgroundSessions.add(sessionId);
    this.lastUserQuery.set(sessionId, note);
    await this.syncSessionModel(sessionId);
    await this.harness.submit(`[scheduled-followup] ${note}`, {
      session: sessionId,
      entry: { kind: "tock.followup", data: { note } },
    });
  }

  private async executeRoutine(
    routineId: string,
  ): Promise<{ ran: boolean; skippedUnchanged: boolean; wokeModel: boolean }> {
    this.guards.resetSlice();
    const routine = this.routines.get(routineId);
    if (!routine || !routine.enabled) {
      return { ran: false, skippedUnchanged: false, wokeModel: false };
    }

    let checkPayload = "";
    if (routine.checkScript) {
      const checkRes = await this.djs.runCode(routine.checkScript, {}, { readOnly: true });
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
      const hash = await sha256Hex(
        `${routine.id}:${routine.prompt}:${Math.floor(Date.now() / 60_000)}`,
      );
      const { changed } = this.routines.markRun(routine.id, hash);
      if (routine.quietIfUnchanged && !changed) {
        return { ran: true, skippedUnchanged: true, wokeModel: false };
      }
    }

    const bgModel = parseModelSpec(
      this.settingsStore.get().backgroundModel || this.settingsStore.get().model,
    );
    if (bgModel) {
      await this.harness.session(ROOT_SESSION).setModel(bgModel);
    }
    const promptBody = checkPayload
      ? `[routine:${routine.name}] Change detected.\nCheck output: ${checkPayload.slice(0, 3000)}\nInstruction: ${routine.prompt}`
      : `[routine:${routine.name}] ${routine.prompt}`;
    this.backgroundSessions.add(ROOT_SESSION);
    this.lastUserQuery.set(ROOT_SESSION, routine.prompt);
    await this.harness.submit(promptBody, {
      session: ROOT_SESSION,
      entry: { kind: "tock.routine", data: { routineId: routine.id, name: routine.name } },
    });
    return { ran: true, skippedUnchanged: false, wokeModel: true };
  }

  private async consolidateSessionMemory(sessionId: string): Promise<void> {
    const entries = await this.harness.messages({ session: sessionId });
    if (entries.length === 0) return;
    const cfg = this.settingsStore.get();
    const model = resolveModel(this.models, cfg.backgroundModel || cfg.model, this.env);
    if (model) {
      const transcriptText = entries
        .slice(-20)
        .map((e) => JSON.stringify(e))
        .join("\n");
      try {
        await this.memory.consolidateWithModel(
          this.models,
          model,
          sessionId,
          transcriptText,
          (text) => this.vault.redact(text),
        );
        return;
      } catch {
        return;
      }
    }
    this.memory.applyBatch({
      addItems: [
        {
          kind: "summary",
          content: `Session ${sessionId} updated (${entries.length} entries).`,
          sourceSessionId: sessionId,
        },
      ],
    });
  }

  private async notifyOwner(title: string, body: string): Promise<void> {
    this.broadcast("notification.push", { title, body, ts: Date.now() });
    if (this.ctx.getWebSockets().length === 0) {
      await this.push.deliverOffline(title, body);
    }
  }

  private latestEventSeq(): number {
    const row = this.ctx.storage.sql
      .exec<{ seq: number | null }>(`SELECT MAX(seq) AS seq FROM tock_events`)
      .one();
    return Number(row.seq ?? 0);
  }

  private recordEvent(sessionId: string | null, event: string, payload: unknown): number {
    const payloadJson = JSON.stringify(payload);
    this.ctx.storage.sql.exec(
      `INSERT INTO tock_events (session_id, event, payload_json, created_at) VALUES (?, ?, ?, ?)`,
      sessionId,
      event,
      payloadJson,
      Date.now(),
    );
    const seq = this.latestEventSeq();
    if (seq > MAX_STORED_EVENTS && seq % 50 === 0) {
      this.ctx.storage.sql.exec(`DELETE FROM tock_events WHERE seq <= ?`, seq - MAX_STORED_EVENTS);
    }
    return seq;
  }

  private replayEvents(ws: WebSocket, sessionId: string, afterSeq: number): number {
    const rows = this.ctx.storage.sql
      .exec<{ seq: number; event: string; payload_json: string }>(
        `SELECT seq, event, payload_json FROM tock_events
         WHERE seq > ? AND (session_id IS NULL OR session_id = ?)
         ORDER BY seq ASC LIMIT ${MAX_STORED_EVENTS * 2}`,
        afterSeq,
        sessionId,
      )
      .toArray();
    for (const r of rows) {
      this.sendWs(ws, {
        type: "event",
        seq: Number(r.seq),
        event: String(r.event),
        payload: JSON.parse(String(r.payload_json)),
      });
    }
    return rows.length;
  }

  private sendWs(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      return;
    }
  }

  private broadcast(event: string, payload: unknown): void {
    const seq = this.recordEvent(null, event, payload);
    const encoded = JSON.stringify({ type: "event", seq, event, payload } satisfies ServerFrame);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(encoded);
      } catch {
        continue;
      }
    }
  }

  private broadcastSession(
    sessionId: string,
    event: string,
    payload: unknown,
    persist = true,
  ): void {
    const seq = persist ? this.recordEvent(sessionId, event, payload) : this.latestEventSeq();
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
