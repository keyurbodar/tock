import type { TockDO } from "./do.js";

export interface Env {
  TOCK_DO: DurableObjectNamespace<TockDO>;
  VAULT_MASTER_KEY: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_ALLOW_ANON?: string;
  DEFAULT_TIMEZONE?: string;
  AI_GATEWAY_ID?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export interface OwnerSettings {
  devMode: boolean;
  maxSubagents: number;
  model: string | null;
  backgroundModel: string | null;
  fallbackModel: string | null;
  timezone: string;
  updatedAt: number;
}

export interface MemoryItem {
  id: string;
  kind: "fact" | "decision" | "summary" | "preference";
  content: string;
  sourceSessionId: string | null;
  supersededBy: string | null;
  createdAt: number;
}

export interface OpenItem {
  id: string;
  title: string;
  context: string;
  sessionId: string | null;
  status: "open" | "resolved";
  dueAt: number | null;
  updatedAt: number;
}

export interface SecretMeta {
  name: string;
  description: string;
  scopes: string;
  updatedAt: number;
}

export interface RoutineRecord {
  id: string;
  name: string;
  schedule: string;
  scheduleType: "cron" | "interval" | "delayed";
  prompt: string;
  quietIfUnchanged: boolean;
  lastHash: string | null;
  enabled: boolean;
  schedulerJobId: string | null;
  lastRunAt: number | null;
  updatedAt: number;
}

export interface McpServerRecord {
  id: string;
  name: string;
  url: string;
  headersJson: string;
  enabled: boolean;
  updatedAt: number;
}

export interface DevPluginRecord {
  id: string;
  name: string;
  kind: "tool" | "webhook_filter";
  description: string;
  schemaJson: string;
  tsSource: string;
  enabled: boolean;
  updatedAt: number;
}

export interface WsAttachment {
  cursor: number;
  sessionId: string;
  owner: string;
}

export type ClientFrame =
  | { id: string; type: "chat.send"; sessionId?: string; text: string; operationId?: string }
  | { id: string; type: "chat.abort"; sessionId?: string; operationId?: string }
  | { id: string; type: "session.list" }
  | { id: string; type: "session.create"; title?: string }
  | { id: string; type: "session.messages"; sessionId?: string }
  | { id: string; type: "settings.get" }
  | { id: string; type: "settings.update"; patch: Partial<Omit<OwnerSettings, "updatedAt">> }
  | { id: string; type: "vault.list" }
  | { id: string; type: "vault.set"; name: string; value: string; description?: string; scopes?: string }
  | { id: string; type: "vault.delete"; name: string }
  | { id: string; type: "mcp.list" }
  | { id: string; type: "mcp.upsert"; name: string; url: string; headers?: Record<string, string> }
  | { id: string; type: "mcp.delete"; idOrName: string }
  | { id: string; type: "routine.list" }
  | { id: string; type: "routine.upsert"; routine: Omit<RoutineRecord, "id" | "lastHash" | "schedulerJobId" | "lastRunAt" | "updatedAt"> & { id?: string } }
  | { id: string; type: "routine.delete"; routineId: string }
  | { id: string; type: "plugin.list" }
  | { id: string; type: "plugin.upsert"; plugin: Omit<DevPluginRecord, "id" | "updatedAt"> & { id?: string } }
  | { id: string; type: "plugin.delete"; pluginId: string }
  | { id: string; type: "memory.get" }
  | { id: string; type: "memory.search"; query: string; limit?: number }
  | { id: string; type: "ping" };

export type ServerFrame =
  | { id?: string; type: "ok"; data?: unknown }
  | { id?: string; type: "error"; code: string; message: string }
  | { type: "event"; seq: number; event: string; payload: unknown }
  | { id?: string; type: "pong"; ts: number };
