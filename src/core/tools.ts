import {
  defineExtension,
  defineTool,
  hook,
  section,
  SubmissionSettled,
  ToolTask,
  type Extension,
  type ToolRegistration
} from "@earendil-works/pi-durable";
import { lit, map, num, obj, opt, str, union, unknown } from "@earendil-works/pi-schema";
import type { UnifiedMemory } from "./memory.js";
import type { Vault } from "./vault.js";
import type { ExecutionGuards } from "./guards.js";
import type { McpHub } from "./mcp.js";
import type { SubagentPool } from "./subagents.js";
import type { SettingsStore } from "./settings.js";
import type { DjsRuntime } from "../dev/djs.js";

export interface TockToolsDeps {
  memory: UnifiedMemory;
  vault: Vault;
  guards: ExecutionGuards;
  mcp: McpHub;
  subagents: SubagentPool;
  settings: SettingsStore;
  djs: DjsRuntime;
  notifyOwner: (title: string, body: string) => Promise<void>;
  scheduleFollowup: (delaySeconds: number, note: string, sessionId?: string) => Promise<string>;
}

const MemorySearchParams = obj({
  query: str(),
  limit: opt(num())
});

const MemorySaveParams = obj({
  kind: union([lit("fact"), lit("decision"), lit("summary"), lit("preference")]),
  content: str(),
  supersedesId: opt(str())
});

const OpenItemParams = obj({
  id: opt(str()),
  title: str(),
  context: opt(str()),
  status: opt(union([lit("open"), lit("resolved")]))
});

const ScheduleFollowupParams = obj({
  delaySeconds: num(),
  note: str()
});

const NotifyOwnerParams = obj({
  title: str(),
  body: str()
});

const McpListParams = obj({
  server: opt(str())
});

const McpCallParams = obj({
  server: str(),
  tool: str(),
  args: opt(map(unknown()))
});

const SubagentParams = obj({
  task: str()
});

const CodemodeParams = obj({
  code: str(),
  params: opt(map(unknown()))
});

const PluginParams = obj({
  args: opt(map(unknown()))
});

export function createTockExtension(deps: TockToolsDeps): Extension {
  const memorySearchTool = defineTool({
    name: "memory_search",
    description: "Search unified long-term memory across all previous threads using full-text search.",
    parameters: MemorySearchParams,
    replay: "safe",
    async execute(args) {
      const hits = deps.memory.search(args.query, args.limit ?? 8);
      return { output: [{ type: "text", text: JSON.stringify(hits) }] };
    }
  });

  const memorySaveTool = defineTool({
    name: "memory_save",
    description: "Persist an atomic fact, decision, preference, or summary into unified memory.",
    parameters: MemorySaveParams,
    async execute(args, api) {
      const res = deps.memory.applyBatch({
        addItems: [
          {
            kind: args.kind,
            content: args.content,
            sourceSessionId: String(api.conversationId),
            supersedesId: args.supersedesId
          }
        ]
      });
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    }
  });

  const openItemTool = defineTool({
    name: "open_item_set",
    description: "Create, update, or resolve an active open item that tock is tracking across threads.",
    parameters: OpenItemParams,
    async execute(args, api) {
      const res = deps.memory.applyBatch({
        upsertOpenItems: [
          {
            id: args.id,
            title: args.title,
            context: args.context,
            sessionId: String(api.conversationId),
            status: args.status ?? "open"
          }
        ]
      });
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    }
  });

  const scheduleFollowupTool = defineTool({
    name: "schedule_followup",
    description: "Schedule a durable alarm wake-up to re-check an async job, MCP task, or external state later.",
    parameters: ScheduleFollowupParams,
    async execute(args, api) {
      const id = await deps.scheduleFollowup(args.delaySeconds, args.note, String(api.conversationId));
      return { output: [{ type: "text", text: JSON.stringify({ scheduleId: id }) }] };
    }
  });

  const notifyOwnerTool = defineTool({
    name: "notify_owner",
    description: "Send a proactive alert to the owner when something genuinely needs attention.",
    parameters: NotifyOwnerParams,
    async execute(args) {
      await deps.notifyOwner(args.title, args.body);
      return { output: [{ type: "text", text: JSON.stringify({ delivered: true }) }] };
    }
  });

  const mcpListTool = defineTool({
    name: "mcp_discover",
    description: "List connected Remote MCP servers or discover tools exposed by a specific MCP server.",
    parameters: McpListParams,
    replay: "safe",
    async execute(args) {
      if (!args.server) {
        const servers = deps.mcp.listServers().map((s) => ({ name: s.name, url: s.url, enabled: s.enabled }));
        return { output: [{ type: "text", text: JSON.stringify({ servers }) }] };
      }
      const tools = await deps.mcp.discoverTools(args.server);
      return { output: [{ type: "text", text: JSON.stringify({ server: args.server, tools }) }] };
    }
  });

  const mcpCallTool = defineTool({
    name: "mcp_call",
    description: "Invoke any tool on any connected Remote MCP server (including coding-agent hubs like t3code).",
    parameters: McpCallParams,
    async execute(args) {
      const result = await deps.mcp.callTool(args.server, args.tool, args.args ?? {});
      return { output: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }] };
    }
  });

  const spawnSubagentTool = defineTool({
    name: "spawn_subagent",
    description: "Delegate an isolated subtask to a child subagent subject to the owner's max_subagents concurrency limit.",
    parameters: SubagentParams,
    async execute(args, api, context) {
      const taskKey = String(api.taskId);
      const settled = await api.readSignal(SubmissionSettled, "answered", context);
      if (settled && "value" in settled) {
        deps.subagents.release(taskKey);
        const val = settled.value as { status?: string; text?: string };
        const text = val.status === "answered" ? val.text ?? "" : `subagent_${val.status ?? "settled"}`;
        return { output: [{ type: "text", text }] };
      }

      const childId = await api.commit(async (tx) => {
        const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
        if (existing) return existing.id;
        const created = await tx.createConversation({
          ownership: { kind: "task", taskId: api.taskId }
        });
        return created.id;
      }, context);

      await deps.subagents.acquire(taskKey, String(childId), context.abortSignal);
      const childConv = await api.conversation(childId, context);
      await childConv?.submit(
        {
          type: "input",
          content: args.task,
          requestId: `subagent:${taskKey}`,
          notify: { taskId: api.taskId, key: "answered" }
        },
        context
      );

      return { sleep: { signals: [SubmissionSettled.key("answered")] } };
    }
  });

  const codemodeTool = defineTool({
    name: "codemode",
    description: "Execute a TypeScript script in the @earendil-works/djs WASM sandbox with tock.fetch, tock.callMcp, tock.memorySearch, tock.memorySave, tock.scheduleFollowup, and tock.notify.",
    parameters: CodemodeParams,
    async execute(args) {
      const res = await deps.djs.runCode(args.code, args.params ?? {});
      return { output: [{ type: "text", text: JSON.stringify(res) }] };
    }
  });

  const tools: ToolRegistration[] = [
    memorySearchTool as unknown as ToolRegistration,
    memorySaveTool as unknown as ToolRegistration,
    openItemTool as unknown as ToolRegistration,
    scheduleFollowupTool as unknown as ToolRegistration,
    notifyOwnerTool as unknown as ToolRegistration,
    mcpListTool as unknown as ToolRegistration,
    mcpCallTool as unknown as ToolRegistration,
    spawnSubagentTool as unknown as ToolRegistration,
    codemodeTool as unknown as ToolRegistration
  ];

  if (deps.settings.get().devMode) {
    for (const plugin of deps.djs.listPlugins()) {
      if (!plugin.enabled || plugin.kind !== "tool") continue;
      const pluginTool = defineTool({
        name: `dev_${plugin.name}`,
        description: plugin.description || `Dev-mode plugin ${plugin.name}`,
        parameters: PluginParams,
        async execute(args) {
          const res = await deps.djs.runCode(plugin.tsSource, { args: args.args ?? {} });
          return { output: [{ type: "text", text: JSON.stringify(res) }] };
        }
      });
      tools.push(pluginTool as unknown as ToolRegistration);
    }
  }

  const unifiedContextSection = section("tock_context", () => {
    const sections: string[] = [];
    const mem = deps.memory.renderAutoContext("");
    if (mem) sections.push(mem);
    const manifest = deps.vault.renderManifest();
    if (manifest) sections.push(`## Vault Handles (never ask for these)\n${manifest}`);
    const servers = deps.mcp.listServers().filter((s) => s.enabled);
    if (servers.length > 0) {
      sections.push(`## Connected MCP Servers\n${servers.map((s) => `- ${s.name} (${s.url})`).join("\n")}`);
    }
    const cfg = deps.settings.get();
    sections.push(
      `## Runtime\n- max_subagents: ${cfg.maxSubagents}\n- dev_mode: ${cfg.devMode}\n- timezone: ${cfg.timezone}`
    );
    return sections.join("\n\n");
  });

  const guardHooks = hook(ToolTask, {
    beforeTool(call, api) {
      const loop = deps.guards.checkLoop(String(api.conversationId), call.name, call.arguments);
      if (loop.blocked) {
        return {
          block: `loop_guard: tool "${call.name}" called identically ${loop.count} times in a row. Change strategy.`
        };
      }
      return undefined;
    }
  });

  return defineExtension({
    name: "tock.core",
    tools,
    sections: [unifiedContextSection],
    hooks: [guardHooks]
  });
}
