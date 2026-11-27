import type { TockDO } from "./do.js";

export interface Env {
  TOCK_DO: DurableObjectNamespace<TockDO>;
  FILES?: R2Bucket;
  VAULT_MASTER_KEY: string;
  TOCK_ACCESS_KEY?: string;
  ASSETS?: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_ALLOW_ANON?: string;
  DEFAULT_TIMEZONE?: string;
  AI_GATEWAY_URL?: string;
  EMAIL_DOMAIN?: string;
  EMAIL_OWNER?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export type ThinkingLevelOption = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type NotificationUrgency = "low" | "normal" | "urgent";

export interface OwnerSettings {
  devMode: boolean;
  maxSubagents: number;
  model: string | null;
  backgroundModel: string | null;
  fallbackModel: string | null;
  timezone: string;
  proactiveHeartbeat: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  morningBriefTime: string | null;
  updatedAt: number;
}

export interface QueuedNotificationRecord {
  id: string;
  title: string;
  body: string;
  urgency: NotificationUrgency;
  createdAt: number;
}

export interface NotifyResult {
  delivered: boolean;
  queued: boolean;
  urgency: NotificationUrgency;
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
  origin: string;
  updatedAt: number;
}

export interface RoutineRecord {
  id: string;
  name: string;
  schedule: string;
  scheduleType: "cron" | "interval" | "delayed";
  prompt: string;
  checkScript: string | null;
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
  authMode: "headers" | "oauth" | "sse";
  managerServerId: string | null;
  enabled: boolean;
  updatedAt: number;
  toolCount: number | null;
  checkedAt: number | null;
  lastError: string | null;
}

export type McpServerView = Omit<McpServerRecord, "headersJson" | "managerServerId"> & {
  headerNames: string[];
};

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

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  storageKind: "r2" | "sqlite";
  sessionId: string | null;
  createdAt: number;
}

export interface SkillRecord {
  name: string;
  description: string;
  source: string;
  commitSha: string | null;
  bodyMd: string;
  filesJson: string;
  enabled: boolean;
  updatedAt: number;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
}

export interface PushDevice {
  endpoint: string;
  label: string;
  lastSeenAt: number;
  lastDeliveredAt: number | null;
  failedAt: number | null;
}

export interface WsAttachment {
  cursor: number;
  sessionId: string;
  owner: string;
}

export type ClientFrame =
  | {
      id: string;
      type: "chat.send";
      sessionId?: string;
      text: string;
      operationId?: string;
      model?: string;
      thinkingLevel?: ThinkingLevelOption;
    }
  | {
      id: string;
      type: "session.configure";
      sessionId?: string;
      model?: string;
      thinkingLevel?: ThinkingLevelOption;
    }
  | { id: string; type: "chat.subscribe"; sessionId?: string; cursor?: number }
  | { id: string; type: "chat.abort"; sessionId?: string; operationId?: string }
  | { id: string; type: "ask.answer"; sessionId?: string; answer: string }
  | { id: string; type: "session.list" }
  | { id: string; type: "session.create"; title?: string }
  | { id: string; type: "thread.update"; threadId: string; title?: string | null; pinned?: boolean; archived?: boolean; unread?: boolean; folder?: string | null; snoozedUntil?: number | null }
  | { id: string; type: "thread.delete"; threadId: string }
  | { id: string; type: "session.messages"; sessionId?: string }
  | { id: string; type: "settings.get" }
  | { id: string; type: "settings.update"; patch: Partial<Omit<OwnerSettings, "updatedAt">> }
  | { id: string; type: "models.list"; provider?: string }
  | { id: string; type: "models.refresh"; providers?: string[] }
  | { id: string; type: "vault.list" }
  | {
      id: string;
      type: "vault.set";
      name: string;
      value: string;
      description?: string;
      scopes?: string;
      origin?: string;
    }
  | {
      id: string;
      type: "vault.update";
      name: string;
      rename?: string;
      value?: string;
      description?: string;
      origin?: string;
    }
  | { id: string; type: "vault.delete"; name: string }
  | { id: string; type: "mcp.list" }
  | {
      id: string;
      type: "mcp.upsert";
      name: string;
      url: string;
      headers?: Record<string, string>;
      authMode?: "headers" | "oauth" | "sse";
    }
  | { id: string; type: "mcp.delete"; idOrName: string }
  | { id: string; type: "mcp.test"; idOrName: string }
  | { id: string; type: "mcp.enable"; idOrName: string; enabled: boolean }
  | { id: string; type: "routine.list" }
  | {
      id: string;
      type: "routine.upsert";
      routine: Omit<
        RoutineRecord,
        "id" | "lastHash" | "schedulerJobId" | "lastRunAt" | "updatedAt"
      > & { id?: string };
    }
  | { id: string; type: "routine.delete"; routineId: string }
  | { id: string; type: "proactive.sync" }
  | { id: string; type: "notifications.list" }
  | { id: string; type: "notifications.flush" }
  | { id: string; type: "plugin.list" }
  | {
      id: string;
      type: "plugin.upsert";
      plugin: Omit<DevPluginRecord, "id" | "updatedAt"> & { id?: string };
    }
  | { id: string; type: "plugin.delete"; pluginId: string }
  | { id: string; type: "skill.list" }
  | {
      id: string;
      type: "skill.upsert";
      name: string;
      description?: string;
      bodyMd: string;
      files?: Record<string, string>;
    }
  | { id: string; type: "skill.update"; name: string; description: string; bodyMd: string }
  | { id: string; type: "skill.import"; source: string }
  | { id: string; type: "skill.delete"; name: string }
  | { id: string; type: "file.list"; sessionId?: string }
  | { id: string; type: "file.delete"; fileId: string }
  | {
      id: string;
      type: "push.subscribe";
      endpoint: string;
      p256dh: string;
      auth: string;
      label?: string;
    }
  | { id: string; type: "push.list"; endpoint?: string }
  | { id: string; type: "push.unsubscribe"; endpoint: string }
  | { id: string; type: "memory.get" }
  | { id: string; type: "memory.search"; query: string; limit?: number }
  | { id: string; type: "ping" };

export type ServerFrame =
  | { id?: string; type: "ok"; data?: unknown }
  | { id?: string; type: "error"; code: string; message: string }
  | { type: "event"; seq: number; event: string; payload: unknown }
  | { id?: string; type: "pong"; ts: number };
