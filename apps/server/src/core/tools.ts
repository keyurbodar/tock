import {
  defineExtension,
  defineSignal,
  defineTool,
  hook,
  section,
  SubmissionSettled,
  ToolTask,
  type Extension,
  type TaskId,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { arr, bool, lit, map, num, obj, opt, str, union, unknown } from "@earendil-works/pi-schema";
import { FOLLOWUPS_TOOL, followupsOf } from "@tock/protocol";
import type { UnifiedMemory } from "./memory.js";
import type { Vault } from "./vault.js";
import type { ExecutionGuards } from "./guards.js";
import type { McpHub } from "./mcp.js";
import type { SubagentPool } from "./subagents.js";
import type { SettingsStore } from "./settings.js";
import type { RoutineStore } from "./routines.js";
import type { FileStore } from "./files.js";
import type { SkillStore } from "./skills.js";
import { isBackgroundReadOnlyViolation, transientRetries } from "./resilience.js";
import type { NotificationUrgency, NotifyResult } from "../types.js";
import { TOCK_CODEMODE_DTS, type DjsRuntime } from "../dev/djs.js";

export interface TockToolsDeps {
  memory: UnifiedMemory;
  vault: Vault;
  guards: ExecutionGuards;
  mcp: McpHub;
  subagents: SubagentPool;
  settings: SettingsStore;
  routines: RoutineStore;
  files: FileStore;
  skills: SkillStore;
  djs: DjsRuntime;
  getLastUserQuery: (conversationId: string) => string;
  isBackgroundSession: (conversationId: string) => boolean;
  notifyOwner: (title: string, body: string, urgency?: NotificationUrgency) => Promise<NotifyResult>;
  scheduleFollowup: (delaySeconds: number, note: string, sessionId?: string) => Promise<string>;
  onAsk: (sessionId: string, taskId: TaskId, ask: OwnerAsk | null) => void;
  react: (sessionId: string, emoji: string, ref?: string) => Promise<{ ref: string | null; changed: boolean }>;
}

export interface OwnerAsk {
  kind: "approval" | "question";
  question: string;
  summary?: string;
  options: string[];
  questions?: { question: string; options: string[] }[];
}

export const OwnerAnswer = defineSignal({ name: "tock.owner-answer", version: 1, schema: obj({ answer: str() }) });

const MemorySearchParams = obj({ query: str(), limit: opt(num()) });
const MemorySaveParams = obj({
  kind: union([lit("fact"), lit("decision"), lit("summary"), lit("preference")]),
  content: str(),
  supersedesId: opt(str()),
});
const OpenItemParams = obj({
  id: opt(str()),
  title: str(),
  context: opt(str()),
  status: opt(union([lit("open"), lit("resolved")])),
});
const ScheduleFollowupParams = obj({ delaySeconds: num(), note: str() });
const RoutineUpsertParams = obj({
  id: opt(str()),
  name: str(),
  schedule: str(),
  scheduleType: union([lit("cron"), lit("interval"), lit("delayed")]),
  prompt: str(),
  checkScript: opt(str()),
  quietIfUnchanged: opt(bool()),
  enabled: opt(bool()),
});
const RoutineDeleteParams = obj({ id: str() });
const EmptyParams = obj({});
const NotifyOwnerParams = obj({
  title: str(),
  body: str(),
  urgency: opt(union([lit("low"), lit("normal"), lit("urgent")]))
});
const McpListParams = obj({ server: opt(str()) });
const McpCallParams = obj({ server: str(), tool: str(), args: opt(map(unknown())) });
const SubagentParams = obj({ task: str() });
const CodemodeParams = obj({ code: str(), params: opt(map(unknown())) });
const DevPluginRunParams = obj({ name: str(), args: opt(map(unknown())) });
const HttpRequestParams = obj({
  method: union([lit("GET"), lit("POST"), lit("PUT"), lit("PATCH"), lit("DELETE")]),
  url: str(),
  headers: opt(map(str())),
  query: opt(map(str())),
  body: opt(str()),
});
const FileReadParams = obj({ id: str() });
const FileWriteParams = obj({ name: str(), content: str(), mime: opt(str()) });
const SkillReadParams = obj({ name: str(), file: opt(str()) });
const ReactParams = obj({ emoji: str({ minLength: 1, maxLength: 32 }), ref: opt(str()) });
const UpdatePlanParams = obj({ steps: arr(str()), current: num() });
const SuggestFollowupsParams = obj({
  suggestions: arr(obj({ emoji: str(), label: str(), prompt: str() })),
});
const AskOwnerParams = obj({
  question: str(),
  kind: opt(union([lit("approval"), lit("question")])),
  summary: opt(str()),
  options: opt(arr(str())),
  questions: opt(arr(obj({ question: str(), options: arr(str()) }))),
});

export function createTockExtension(deps: TockToolsDeps): Extension {
  const memorySearchTool = defineTool({
    name: "memory_search",
    description:
      "Search unified long-term memory across all previous threads using full-text search.",
    parameters: MemorySearchParams,
    replay: "safe",
    async execute(args) {
      return {
        output: [
          { type: "text", text: JSON.stringify(deps.memory.search(args.query, args.limit ?? 8)) },
        ],
      };
    },
  });

  const memorySaveTool = defineTool({
    name: "memory_save",
    description: "Persist an atomic fact, decision, preference, or summary into unified memory.",
    parameters: MemorySaveParams,
    async execute(args, api) {
      const safeContent = await deps.vault.redact(args.content);
      const res = deps.memory.applyBatch({
        addItems: [
          {
            kind: args.kind,
            content: safeContent,
            sourceSessionId: String(api.conversationId),
            supersedesId: args.supersedesId,
          },
        ],
      });
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    },
  });

  const openItemTool = defineTool({
    name: "open_item_set",
    description: "Create, update, or resolve an active open item tracked across threads.",
    parameters: OpenItemParams,
    async execute(args, api) {
      const res = deps.memory.applyBatch({
        upsertOpenItems: [
          {
            id: args.id,
            title: args.title,
            context: args.context,
            sessionId: String(api.conversationId),
            status: args.status ?? "open",
          },
        ],
      });
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    },
  });

  const httpRequestTool = defineTool({
    name: "http_request",
    description:
      "Call any external REST API directly. Supports origin-locked {{secret:name}} placeholders in https:// url, headers, and body with automatic secret redaction.",
    parameters: HttpRequestParams,
    async execute(args) {
      const check = deps.guards.recordSubrequest(1);
      if (!check.allowed) {
        return {
          output: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: `subrequest_budget_exceeded_${check.limit}`,
              }),
            },
          ],
        };
      }
      const baseUrl = await deps.vault.injectForUrl(args.url, args.url);
      const u = new URL(baseUrl);
      if (args.query) {
        for (const [k, v] of Object.entries(args.query)) {
          u.searchParams.set(k, await deps.vault.injectForUrl(u.toString(), v));
        }
      }
      const finalUrl = u.toString();
      const headers = args.headers
        ? await deps.vault.injectRecordForUrl(finalUrl, args.headers)
        : undefined;
      const body =
        args.body !== undefined ? await deps.vault.injectForUrl(finalUrl, args.body) : undefined;
      const res = await fetch(finalUrl, { method: args.method, headers, body, redirect: "manual" });
      const text = await deps.vault.redact((await res.text()).slice(0, 16_000));
      const rawLocation = res.headers.get("location");
      const location = rawLocation ? await deps.vault.redact(rawLocation) : undefined;
      return {
        output: [
          {
            type: "text",
            text: JSON.stringify({ status: res.status, ok: res.ok, location, body: text }),
          },
        ],
      };
    },
  });

  const fileListTool = defineTool({
    name: "file_list",
    description: "List uploaded or generated files stored in R2 or SQLite.",
    parameters: EmptyParams,
    replay: "safe",
    async execute() {
      return { output: [{ type: "text", text: JSON.stringify(deps.files.list()) }] };
    },
  });

  const fileReadTool = defineTool({
    name: "file_read",
    description: "Read a stored text file by id.",
    parameters: FileReadParams,
    replay: "safe",
    async execute(args) {
      const found = await deps.files.readText(args.id);
      if (!found)
        return { output: [{ type: "text", text: JSON.stringify({ error: "file_not_found" }) }] };
      const safe = await deps.vault.redact(found.text.slice(0, 24_000));
      return { output: [{ type: "text", text: JSON.stringify({ meta: found.meta, text: safe }) }] };
    },
  });

  const fileWriteTool = defineTool({
    name: "file_write",
    description: "Save a file to R2 (or SQLite fallback) and return its file id.",
    parameters: FileWriteParams,
    async execute(args, api) {
      const meta = await deps.files.put(
        args.name,
        args.mime ?? "text/plain",
        new TextEncoder().encode(args.content),
        String(api.conversationId),
      );
      return { output: [{ type: "text", text: JSON.stringify(meta) }] };
    },
  });

  const skillReadTool = defineTool({
    name: "skill_read",
    description: "Load the full instructions or a reference file of an installed skill on demand.",
    parameters: SkillReadParams,
    replay: "safe",
    async execute(args) {
      const content = deps.skills.readFile(args.name, args.file);
      return { output: [{ type: "text", text: content ?? `skill_not_found:${args.name}` }] };
    },
  });

  const scheduleFollowupTool = defineTool({
    name: "schedule_followup",
    description:
      "Schedule a durable alarm wake-up to re-check an async job, MCP task, or external state later.",
    parameters: ScheduleFollowupParams,
    async execute(args, api) {
      const id = await deps.scheduleFollowup(
        args.delaySeconds,
        args.note,
        String(api.conversationId),
      );
      return { output: [{ type: "text", text: JSON.stringify({ scheduleId: id }) }] };
    },
  });

  const routineUpsertTool = defineTool({
    name: "routine_upsert",
    description:
      "Create or update a recurring watch or routine. Pass checkScript (TypeScript run in djs using tock.fetch) to hash external state with zero LLM tokens and only wake when it changes.",
    parameters: RoutineUpsertParams,
    async execute(args) {
      const saved = await deps.routines.upsert({
        id: args.id,
        name: args.name,
        schedule: args.schedule,
        scheduleType: args.scheduleType,
        prompt: args.prompt,
        checkScript: args.checkScript ?? null,
        quietIfUnchanged: args.quietIfUnchanged ?? true,
        enabled: args.enabled ?? true,
      });
      return { output: [{ type: "text", text: JSON.stringify(saved) }] };
    },
  });

  const routineListTool = defineTool({
    name: "routine_list",
    description: "List all active and paused routines and watchers.",
    parameters: EmptyParams,
    replay: "safe",
    async execute() {
      return { output: [{ type: "text", text: JSON.stringify(deps.routines.list()) }] };
    },
  });

  const routineDeleteTool = defineTool({
    name: "routine_delete",
    description: "Delete a routine or watcher by id.",
    parameters: RoutineDeleteParams,
    async execute(args) {
      return {
        output: [
          { type: "text", text: JSON.stringify({ deleted: await deps.routines.delete(args.id) }) },
        ],
      };
    },
  });

  const updatePlanTool = defineTool({
    name: "update_plan",
    description:
      "Show the owner your plan for this turn as a short checklist (2 to 6 plain steps). Call it once before multi-step work and again whenever you move to the next step; `current` is the zero-based index of the step you are on, or steps.length when everything is done.",
    parameters: UpdatePlanParams,
    replay: "safe",
    async execute(args) {
      const current = Math.max(0, Math.min(args.steps.length, Math.floor(args.current)));
      return { output: [{ type: "text", text: JSON.stringify({ steps: args.steps, current }) }] };
    },
  });

  const reactTool = defineTool({
    name: "react",
    description:
      "React to a message with one emoji, the way a person taps a reaction (for thanks, a win or a laugh). Defaults to the owner's latest message; pass ref only to target another one. Cheap and silent: no reply is needed after it.",
    parameters: ReactParams,
    replay: "safe",
    async execute(args, api) {
      try {
        const res = await deps.react(String(api.conversationId), args.emoji.trim(), args.ref);
        return { output: [{ type: "text", text: JSON.stringify(res.ref ? { reacted: args.emoji, ref: res.ref } : { reacted: false, reason: "no message to react to" }) }] };
      } catch (err) {
        return { output: [{ type: "text", text: JSON.stringify({ reacted: false, reason: err instanceof Error ? err.message : String(err) }) }] };
      }
    },
  });

  const suggestFollowupsTool = defineTool({
    name: FOLLOWUPS_TOOL,
    description:
      "Offer the owner up to three next steps after your reply, shown as chips above the composer. Call it once, near the end of a turn that leaves obvious follow-ups. Each has one emoji, a 2 to 4 word label and the full prompt the owner would send. Skip it when nothing useful follows.",
    parameters: SuggestFollowupsParams,
    replay: "safe",
    async execute(args) {
      return { output: [{ type: "text", text: JSON.stringify({ shown: followupsOf(args).length }) }] };
    },
  });

  const askOwnerTool = defineTool({
    name: "ask_owner",
    description:
      "Pause and ask the owner before you continue. Use kind \"approval\" with a one-line summary for anything risky or irreversible (the owner answers Approve or Deny), or kind \"question\" with 2 to 4 short options when you need them to choose. To ask several questions at once, pass questions (each with its own 2 to 4 options); the answer then has one \"question: choice\" line per question. The run resumes with their answer as this tool's result.",
    parameters: AskOwnerParams,
    async execute(args, api, context) {
      const sessionId = String(api.conversationId);
      const state = await api.readSignal(OwnerAnswer, "answer", context);
      if (state?.kind === "value") {
        deps.onAsk(sessionId, api.taskId, null);
        return { output: [{ type: "text", text: JSON.stringify({ answer: state.value.answer }) }] };
      }
      const questions = args.questions?.filter((q) => q.options.length > 0).map((q) => ({ question: q.question, options: q.options.slice(0, 4) }));
      const kind = args.kind ?? (args.options?.length || questions?.length ? "question" : "approval");
      const options = kind === "approval" ? ["Approve", "Deny"] : (args.options ?? questions?.[0]?.options ?? []).slice(0, 4);
      deps.onAsk(sessionId, api.taskId, { kind, question: args.question, summary: args.summary, options, ...(kind === "question" && questions?.length ? { questions } : {}) });
      return { kind: "sleep", signals: [OwnerAnswer.key("answer")] };
    },
  });

  const notifyOwnerTool = defineTool({
    name: "notify_owner",
    description: "Send a proactive alert to the owner (live WebSocket + Web Push / webhook). Respects quiet hours: low/normal alerts queue for morning digest while urgent breaks through immediately.",
    parameters: NotifyOwnerParams,
    async execute(args) {
      const res = await deps.notifyOwner(args.title, args.body, args.urgency ?? "normal");
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    }
  });

  const mcpListTool = defineTool({
    name: "mcp_discover",
    description:
      "List connected Remote MCP servers or discover tools exposed by a specific MCP server.",
    parameters: McpListParams,
    replay: "safe",
    async execute(args) {
      if (!args.server) {
        const servers = deps.mcp
          .listServers()
          .map((s) => ({ name: s.name, url: s.url, authMode: s.authMode, enabled: s.enabled }));
        return { output: [{ type: "text", text: JSON.stringify({ servers }) }] };
      }
      const tools = await deps.mcp.discoverTools(args.server);
      return { output: [{ type: "text", text: JSON.stringify({ server: args.server, tools }) }] };
    },
  });

  const mcpCallTool = defineTool({
    name: "mcp_call",
    description: "Invoke any tool on any connected Remote MCP server.",
    parameters: McpCallParams,
    async execute(args) {
      const result = await deps.mcp.callTool(args.server, args.tool, args.args ?? {});
      return {
        output: [
          { type: "text", text: typeof result === "string" ? result : JSON.stringify(result) },
        ],
      };
    },
  });

  const spawnSubagentTool = defineTool({
    name: "spawn_subagent",
    description:
      "Delegate an isolated subtask to a child subagent subject to the owner's max_subagents concurrency limit.",
    parameters: SubagentParams,
    async execute(args, api, context) {
      const taskKey = String(api.taskId);
      const settled = await api.readSignal(SubmissionSettled, "answered", context);
      if (settled && "value" in settled) {
        deps.subagents.release(taskKey);
        const val = settled.value as { status?: string; text?: string };
        const text =
          val.status === "answered" ? (val.text ?? "") : `subagent_${val.status ?? "settled"}`;
        return { output: [{ type: "text", text }] };
      }

      const childId = await api.commit(async (tx) => {
        const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
        if (existing) return existing.id;
        const created = await tx.createConversation({
          ownership: { kind: "task", taskId: api.taskId },
        });
        return created.id;
      }, context);

      await deps.subagents.acquire(taskKey, String(childId), context.abortSignal);
      try {
        const childConv = await api.conversation(childId, context);
        await childConv?.submit(
          {
            type: "input",
            content: args.task,
            requestId: `subagent:${taskKey}`,
            notify: { taskId: api.taskId, key: "answered" },
          },
          context,
        );
      } catch (err) {
        deps.subagents.release(taskKey);
        throw err;
      }

      return { sleep: { signals: [SubmissionSettled.key("answered")] } };
    },
  });

  const codemodeTool = defineTool({
    name: "codemode",
    description:
      "Execute TypeScript in the @earendil-works/djs WASM sandbox with tock.* APIs (fetch, callMcp, memory, files, scheduleFollowup, notify).",
    parameters: CodemodeParams,
    async execute(args, api) {
      const res = await deps.djs.runCode(args.code, args.params ?? {}, {
        readOnly: deps.isBackgroundSession(String(api.conversationId)),
      });
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    },
  });

  const devPluginRunTool = defineTool({
    name: "dev_plugin_run",
    description:
      "Run an enabled dev-mode TypeScript tool plugin by name (requires devMode enabled).",
    parameters: DevPluginRunParams,
    async execute(args, api) {
      if (!deps.settings.get().devMode) {
        return {
          output: [
            { type: "text", text: JSON.stringify({ ok: false, error: "dev_mode_disabled" }) },
          ],
        };
      }
      const plugin = deps.djs.getPlugin(args.name);
      if (!plugin || !plugin.enabled || plugin.kind !== "tool") {
        return {
          output: [
            {
              type: "text",
              text: JSON.stringify({ ok: false, error: `plugin_not_found:${args.name}` }),
            },
          ],
        };
      }
      const res = await deps.djs.runCode(
        plugin.tsSource,
        { args: args.args ?? {} },
        { readOnly: deps.isBackgroundSession(String(api.conversationId)) },
      );
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    },
  });

  const tools: ToolRegistration[] = [
    memorySearchTool as unknown as ToolRegistration,
    memorySaveTool as unknown as ToolRegistration,
    openItemTool as unknown as ToolRegistration,
    httpRequestTool as unknown as ToolRegistration,
    fileListTool as unknown as ToolRegistration,
    fileReadTool as unknown as ToolRegistration,
    fileWriteTool as unknown as ToolRegistration,
    skillReadTool as unknown as ToolRegistration,
    scheduleFollowupTool as unknown as ToolRegistration,
    routineUpsertTool as unknown as ToolRegistration,
    routineListTool as unknown as ToolRegistration,
    routineDeleteTool as unknown as ToolRegistration,
    updatePlanTool as unknown as ToolRegistration,
    suggestFollowupsTool as unknown as ToolRegistration,
    askOwnerTool as unknown as ToolRegistration,
    reactTool as unknown as ToolRegistration,
    notifyOwnerTool as unknown as ToolRegistration,
    mcpListTool as unknown as ToolRegistration,
    mcpCallTool as unknown as ToolRegistration,
    spawnSubagentTool as unknown as ToolRegistration,
    codemodeTool as unknown as ToolRegistration,
    devPluginRunTool as unknown as ToolRegistration,
  ];

  const stableContextSection = section("tock_context", () => {
    const sections: string[] = [];
    const mem = deps.memory.renderStableContext();
    if (mem) sections.push(mem);
    const manifest = deps.vault.renderManifest();
    if (manifest)
      sections.push(`## Vault Handles (origin-locked, never ask for values)\n${manifest}`);
    const skillIndex = deps.skills.renderIndex();
    if (skillIndex) sections.push(`## Installed Skills (call skill_read to load)\n${skillIndex}`);
    const servers = deps.mcp.listServers().filter((s) => s.enabled);
    if (servers.length > 0) {
      sections.push(
        `## Connected MCP Servers\n${servers.map((s) => `- ${s.name} (${s.url}) [${s.authMode}]`).join("\n")}`,
      );
    }
    const activeRoutines = deps.routines.list().filter((r) => r.enabled);
    if (activeRoutines.length > 0) {
      sections.push(
        `## Active Routines\n${activeRoutines.map((r) => `- ${r.name} [${r.scheduleType}:${r.schedule}]`).join("\n")}`,
      );
    }
    const cfg = deps.settings.get();
    if (cfg.devMode) {
      const plugins = deps.djs.listPlugins().filter((p) => p.enabled && p.kind === "tool");
      if (plugins.length > 0) {
        sections.push(
          `## Dev Plugins (call dev_plugin_run)\n${plugins.map((p) => `- ${p.name}${p.description ? ` — ${p.description}` : ""}`).join("\n")}`,
        );
      }
    }
    sections.push(`## Codemode Runtime API\n\`\`\`ts\n${TOCK_CODEMODE_DTS}\n\`\`\``);
    const quietStr = cfg.quietHoursStart && cfg.quietHoursEnd ? `${cfg.quietHoursStart}-${cfg.quietHoursEnd}` : "off";
    sections.push(
      `## Runtime\n- max_subagents: ${cfg.maxSubagents}\n- dev_mode: ${cfg.devMode}\n- timezone: ${cfg.timezone}\n- proactive_heartbeat: ${cfg.proactiveHeartbeat}\n- quiet_hours: ${quietStr}\n- morning_brief: ${cfg.morningBriefTime ?? "off"}`
    );
    return sections.join("\n\n");
  });

  const dynamicRecallSection = section("tock_recall", (api) => {
    const query = deps.getLastUserQuery(String(api.conversationId));
    return deps.memory.renderQueryRecall(query, 6);
  });

  const guardHooks = hook(ToolTask, {
    async beforeTool(call, api) {
      const convId = String(api.conversationId);
      if (deps.isBackgroundSession(convId)) {
        const violation = await isBackgroundReadOnlyViolation(
          call.name,
          call.arguments,
          (server, tool) => deps.mcp.isToolReadOnly(server, tool),
        );
        if (violation) {
          return { block: violation };
        }
      }
      const loop = deps.guards.checkLoop(convId, call.name, call.arguments);
      if (loop.blocked) {
        return {
          block: `loop_guard: tool "${call.name}" called identically ${loop.count} times in a row. Change strategy.`,
        };
      }
      return undefined;
    },
  });

  return defineExtension({
    name: "tock.core",
    tools,
    sections: [stableContextSection, dynamicRecallSection],
    hooks: [guardHooks, transientRetries],
  });
}
