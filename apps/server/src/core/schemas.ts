import {
  arr,
  bool,
  compile,
  int,
  lit,
  map,
  nullable,
  obj,
  opt,
  str,
  union,
  unknown,
  type Validator,
} from "@earendil-works/pi-schema";
import type { ClientFrame } from "../types.js";

const thinkingLevelSchema = union([
  lit("off"),
  lit("minimal"),
  lit("low"),
  lit("medium"),
  lit("high"),
  lit("xhigh"),
  lit("max"),
]);

const authModeSchema = union([lit("headers"), lit("oauth"), lit("sse")]);
const scheduleTypeSchema = union([lit("cron"), lit("interval"), lit("delayed")]);
const pluginKindSchema = union([lit("tool"), lit("webhook_filter")]);

export const settingsPatchSchema = obj({
  devMode: opt(bool()),
  maxSubagents: opt(int({ minimum: 1, maximum: 16 })),
  model: opt(nullable(str())),
  backgroundModel: opt(nullable(str())),
  fallbackModel: opt(nullable(str())),
  timezone: opt(str({ minLength: 1 })),
  proactiveHeartbeat: opt(bool()),
  quietHoursStart: opt(nullable(str({ pattern: "^([01]\\d|2[0-3]):([0-5]\\d)$" }))),
  quietHoursEnd: opt(nullable(str({ pattern: "^([01]\\d|2[0-3]):([0-5]\\d)$" }))),
  morningBriefTime: opt(nullable(str({ pattern: "^([01]\\d|2[0-3]):([0-5]\\d)$" }))),
});

export const httpModelsRefreshSchema = obj({
  providers: opt(arr(str({ minLength: 1 }))),
});

export const httpProviderCredentialSchema = obj({
  apiKey: str({ minLength: 1 }),
});

export const httpSecretSetSchema = obj({
  name: str({ minLength: 1, maxLength: 128 }),
  value: str({ minLength: 1 }),
  description: opt(str()),
  scopes: opt(str()),
  origin: opt(str()),
});

export const httpSkillUpsertSchema = obj({
  name: opt(str({ minLength: 1 })),
  description: opt(str()),
  bodyMd: str({ minLength: 1 }),
  files: opt(map(str())),
});

export const httpSkillImportSchema = obj({
  source: str({ minLength: 1 }),
});

export const httpMcpOAuthSchema = obj({
  name: str({ minLength: 1 }),
  url: str({ minLength: 1 }),
});

export const httpCodemodeSchema = obj({
  code: str({ minLength: 1 }),
  params: opt(map(unknown())),
});

export const httpSessionConfigureSchema = obj({
  model: opt(str({ minLength: 1 })),
  thinkingLevel: opt(thinkingLevelSchema),
});

export const httpChatSchema = obj({
  text: str({ minLength: 1 }),
  sessionId: opt(str({ minLength: 1 })),
  model: opt(str({ minLength: 1 })),
  thinkingLevel: opt(thinkingLevelSchema),
});

const routineUpsertInnerSchema = obj({
  id: opt(str({ minLength: 1 })),
  name: str({ minLength: 1 }),
  schedule: str({ minLength: 1 }),
  scheduleType: scheduleTypeSchema,
  prompt: str({ minLength: 1 }),
  checkScript: nullable(str()),
  quietIfUnchanged: bool(),
  enabled: bool(),
});

const pluginUpsertInnerSchema = obj({
  id: opt(str({ minLength: 1 })),
  name: str({ minLength: 1 }),
  kind: pluginKindSchema,
  description: str(),
  schemaJson: str(),
  tsSource: str({ minLength: 1 }),
  enabled: bool(),
});


const secretName = str({ minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9_.-]+$" });
const clientFrameSchema = union([
  obj({
    id: str({ minLength: 1 }),
    type: lit("chat.send"),
    sessionId: opt(str({ minLength: 1 })),
    text: str({ minLength: 1 }),
    operationId: opt(str({ minLength: 1 })),
    model: opt(str({ minLength: 1 })),
    thinkingLevel: opt(thinkingLevelSchema),
  }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("session.configure"),
    sessionId: opt(str({ minLength: 1 })),
    model: opt(str({ minLength: 1 })),
    thinkingLevel: opt(thinkingLevelSchema),
  }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("chat.subscribe"),
    sessionId: opt(str({ minLength: 1 })),
    cursor: opt(int({ minimum: 0 })),
  }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("chat.abort"),
    sessionId: opt(str({ minLength: 1 })),
    operationId: opt(str({ minLength: 1 })),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("session.list") }),
  obj({ id: str({ minLength: 1 }), type: lit("session.create"), title: opt(str()) }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("thread.update"),
    threadId: str({ minLength: 1 }),
    title: opt(nullable(str({ maxLength: 200 }))),
    pinned: opt(bool()),
    archived: opt(bool()),
    unread: opt(bool()),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("thread.delete"), threadId: str({ minLength: 1 }) }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("session.messages"),
    sessionId: opt(str({ minLength: 1 })),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("settings.get") }),
  obj({ id: str({ minLength: 1 }), type: lit("settings.update"), patch: settingsPatchSchema }),
  obj({ id: str({ minLength: 1 }), type: lit("models.list"), provider: opt(str()) }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("models.refresh"),
    providers: opt(arr(str({ minLength: 1 }))),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("vault.list") }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("vault.set"),
    name: secretName,
    value: str({ minLength: 1 }),
    description: opt(str()),
    scopes: opt(str()),
    origin: opt(str()),
  }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("vault.update"),
    name: str({ minLength: 1 }),
    rename: opt(secretName),
    value: opt(str({ minLength: 1 })),
    description: opt(str()),
    origin: opt(str()),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("vault.delete"), name: str({ minLength: 1 }) }),
  obj({ id: str({ minLength: 1 }), type: lit("mcp.list") }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("mcp.upsert"),
    name: str({ minLength: 1 }),
    url: str({ minLength: 1 }),
    headers: opt(map(str())),
    authMode: opt(authModeSchema),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("mcp.delete"), idOrName: str({ minLength: 1 }) }),
  obj({ id: str({ minLength: 1 }), type: lit("mcp.test"), idOrName: str({ minLength: 1 }) }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("mcp.enable"),
    idOrName: str({ minLength: 1 }),
    enabled: bool(),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("routine.list") }),
  obj({ id: str({ minLength: 1 }), type: lit("proactive.sync") }),
  obj({ id: str({ minLength: 1 }), type: lit("notifications.list") }),
  obj({ id: str({ minLength: 1 }), type: lit("notifications.flush") }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("routine.upsert"),
    routine: routineUpsertInnerSchema,
  }),
  obj({ id: str({ minLength: 1 }), type: lit("routine.delete"), routineId: str({ minLength: 1 }) }),
  obj({ id: str({ minLength: 1 }), type: lit("plugin.list") }),
  obj({ id: str({ minLength: 1 }), type: lit("plugin.upsert"), plugin: pluginUpsertInnerSchema }),
  obj({ id: str({ minLength: 1 }), type: lit("plugin.delete"), pluginId: str({ minLength: 1 }) }),
  obj({ id: str({ minLength: 1 }), type: lit("skill.list") }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("skill.upsert"),
    name: str({ minLength: 1 }),
    description: opt(str()),
    bodyMd: str({ minLength: 1 }),
    files: opt(map(str())),
  }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("skill.update"),
    name: str({ minLength: 1 }),
    description: str({ maxLength: 1024 }),
    bodyMd: str({ minLength: 1 }),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("skill.import"), source: str({ minLength: 1 }) }),
  obj({ id: str({ minLength: 1 }), type: lit("skill.delete"), name: str({ minLength: 1 }) }),
  obj({ id: str({ minLength: 1 }), type: lit("file.list"), sessionId: opt(str()) }),
  obj({ id: str({ minLength: 1 }), type: lit("file.delete"), fileId: str({ minLength: 1 }) }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("push.subscribe"),
    endpoint: str({ minLength: 1 }),
    p256dh: str({ minLength: 1 }),
    auth: str({ minLength: 1 }),
    label: opt(str({ maxLength: 80 })),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("push.list"), endpoint: opt(str({ minLength: 1 })) }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("push.unsubscribe"),
    endpoint: str({ minLength: 1 }),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("memory.get") }),
  obj({
    id: str({ minLength: 1 }),
    type: lit("memory.search"),
    query: str({ minLength: 1 }),
    limit: opt(int({ minimum: 1, maximum: 50 })),
  }),
  obj({ id: str({ minLength: 1 }), type: lit("ping") }),
]);

export const validators = {
  settingsPatch: compile(settingsPatchSchema),
  httpModelsRefresh: compile(httpModelsRefreshSchema),
  httpProviderCredential: compile(httpProviderCredentialSchema),
  httpSecretSet: compile(httpSecretSetSchema),
  httpSkillUpsert: compile(httpSkillUpsertSchema),
  httpSkillImport: compile(httpSkillImportSchema),
  httpMcpOAuth: compile(httpMcpOAuthSchema),
  httpCodemode: compile(httpCodemodeSchema),
  httpSessionConfigure: compile(httpSessionConfigureSchema),
  httpChat: compile(httpChatSchema),
  clientFrame: compile(clientFrameSchema),
};

export function parseClientFrame(
  raw: unknown,
): { ok: true; frame: ClientFrame } | { ok: false; error: string } {
  const res = validators.clientFrame.validate(raw);
  if (!res.ok) {
    return { ok: false, error: res.errors.map((e) => `${e.path || "$"}: ${e.message}`).join("; ") };
  }
  return { ok: true, frame: res.value as ClientFrame };
}

export async function parseJsonBody<T>(
  request: Request,
  validator: Validator<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "invalid_json" }, { status: 400 }),
    };
  }
  const res = validator.validate(raw);
  if (!res.ok) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "invalid_body",
          details: res.errors.map((e) => `${e.path || "$"}: ${e.message}`),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, value: res.value };
}
