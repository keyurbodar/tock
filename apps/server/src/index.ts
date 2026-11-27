import { accessCookie, accessKeyDigest, authenticateRequest, constantTimeEqual } from "./core/auth.js";
import { parseJsonBody, validators } from "./core/schemas.js";
import type { Env } from "./types.js";

export { TockDO } from "./do.js";

const MAX_WEBHOOK_BYTES = 256 * 1024;

function inlineDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function decodeHeader(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readCapped(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/assets/") && env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      if (!asset.headers.get("content-type")?.startsWith("text/html")) return asset;
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "tock" });
    }

    if (url.pathname.startsWith("/api/hooks/") && request.method === "POST") {
      const hookId = url.pathname.slice("/api/hooks/".length);
      const owner = url.searchParams.get("owner") || "owner@local";
      const token = request.headers.get("x-tock-hook-token") ?? url.searchParams.get("token") ?? "";
      const filterPlugin = url.searchParams.get("filter") ?? undefined;
      const declaredLen = Number(request.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLen) && declaredLen > MAX_WEBHOOK_BYTES) {
        return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
      }
      const rawBytes = await readCapped(request, MAX_WEBHOOK_BYTES);
      if (!rawBytes) {
        return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
      }
      let payload: unknown = {};
      if (rawBytes.byteLength > 0) {
        try {
          payload = JSON.parse(new TextDecoder().decode(rawBytes));
        } catch {
          return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
        }
      }
      const stub = env.TOCK_DO.get(env.TOCK_DO.idFromName(owner));
      const res = await stub.handleWebhook(hookId, token, payload, filterPlugin);
      return Response.json(res, { status: res.accepted ? 202 : 401 });
    }

    if (url.pathname === "/api/auth" && request.method === "POST") {
      const expected = env.TOCK_ACCESS_KEY?.trim();
      const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
      const key = typeof body?.key === "string" ? body.key.trim() : "";
      if (!expected || !key || !constantTimeEqual(await accessKeyDigest(key), await accessKeyDigest(expected))) {
        return Response.json({ ok: false, error: "invalid_access_key" }, { status: 401 });
      }
      return Response.json({ ok: true }, { headers: { "set-cookie": accessCookie(await accessKeyDigest(key), 60 * 60 * 24 * 400) } });
    }

    if (url.pathname === "/api/auth" && request.method === "DELETE") {
      return Response.json({ ok: true }, { headers: { "set-cookie": accessCookie("", 0) } });
    }

    const auth = await authenticateRequest(request, env);
    if (url.pathname === "/api/auth" && request.method === "GET") {
      return Response.json({ ok: auth.ok }, { status: auth.ok ? 200 : 401, headers: { "cache-control": "no-store" } });
    }
    if (!auth.ok) {
      return Response.json({ ok: false, error: auth.reason }, { status: 401 });
    }

    const stub = env.TOCK_DO.get(env.TOCK_DO.idFromName(auth.owner));

    if (url.pathname.startsWith("/mcp/oauth/")) {
      return stub.fetch(request);
    }

    if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const headers = new Headers(request.headers);
      headers.set("x-tock-owner", auth.owner);
      return stub.fetch(new Request(request.url, { method: request.method, headers }));
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      return Response.json(await stub.getHealth());
    }

    if (url.pathname === "/api/memory/revisions" && request.method === "GET") {
      return Response.json({ revisions: await stub.listMemoryRevisions() });
    }

    const memRestoreMatch = url.pathname.match(/^\/api\/memory\/revisions\/(\d+)\/restore$/);
    if (memRestoreMatch && request.method === "POST") {
      const id = Number(memRestoreMatch[1]);
      return Response.json(await stub.restoreMemoryRevision(id));
    }

    if (url.pathname === "/api/models" && request.method === "GET") {
      const provider = url.searchParams.get("provider") ?? undefined;
      return Response.json({ models: await stub.listAvailableModels(provider) });
    }

    if (url.pathname === "/api/models/refresh" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpModelsRefresh);
      if (!parsed.ok) return parsed.response;
      return Response.json(await stub.refreshModels(parsed.value.providers));
    }

    if (url.pathname === "/api/providers" && request.method === "GET") {
      return Response.json({ providers: await stub.listProviders() });
    }

    const providerCredMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/credential$/);
    if (providerCredMatch) {
      const providerId = decodeURIComponent(providerCredMatch[1]!);
      if (request.method === "POST") {
        const parsed = await parseJsonBody(request, validators.httpProviderCredential);
        if (!parsed.ok) return parsed.response;
        return Response.json(await stub.setProviderCredential(providerId, parsed.value.apiKey));
      }
      if (request.method === "DELETE") {
        return Response.json(await stub.deleteProviderCredential(providerId));
      }
    }

    if (url.pathname === "/api/settings" && request.method === "PATCH") {
      const parsed = await parseJsonBody(request, validators.settingsPatch);
      if (!parsed.ok) return parsed.response;
      return Response.json(await stub.updateSettings(parsed.value));
    }

    if (url.pathname === "/api/proactive/sync" && request.method === "POST") {
      return Response.json(await stub.syncProactiveRoutines());
    }

    if (url.pathname === "/api/notifications" && request.method === "GET") {
      return Response.json({ queued: await stub.listQueuedNotifications() });
    }

    if (url.pathname === "/api/notifications/flush" && request.method === "POST") {
      return Response.json(await stub.flushQueuedNotifications());
    }

    if (url.pathname === "/api/secrets" && request.method === "GET") {
      return Response.json({ secrets: await stub.listSecrets() });
    }

    if (url.pathname === "/api/secrets" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpSecretSet);
      if (!parsed.ok) return parsed.response;
      return Response.json(
        await stub.setSecret(
          parsed.value.name,
          parsed.value.value,
          parsed.value.description,
          parsed.value.scopes,
          parsed.value.origin,
        ),
      );
    }

    if (url.pathname === "/api/files" && request.method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      return Response.json({ files: await stub.listFiles(sessionId) });
    }

    if (url.pathname === "/api/files" && request.method === "POST") {
      const name =
        decodeHeader(request.headers.get("x-file-name")) || url.searchParams.get("name") || "upload.bin";
      const mime = request.headers.get("content-type") || "application/octet-stream";
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      const bytes = new Uint8Array(await request.arrayBuffer());
      try {
        return Response.json(await stub.uploadFile(name, mime, bytes, sessionId), { status: 201 });
      } catch (error) {
        const limit = /file_too_large_without_r2_max_(\d+)/.exec(error instanceof Error ? error.message : "");
        if (!limit) throw error;
        return Response.json({ ok: false, error: "file_too_large", limit: Number(limit[1]) }, { status: 413 });
      }
    }

    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      const fileId = decodeURIComponent(url.pathname.slice("/api/files/".length));
      const found = await stub.getFile(fileId);
      if (!found) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
      return new Response(found.bytes, {
        headers: {
          "content-type": found.meta.mime,
          "x-file-size": String(found.bytes.byteLength),
          "content-disposition": inlineDisposition(found.meta.name),
          "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (url.pathname === "/api/skills" && request.method === "GET") {
      return Response.json({ skills: await stub.listSkills() });
    }

    if (url.pathname === "/api/skills" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpSkillUpsert);
      if (!parsed.ok) return parsed.response;
      return Response.json(await stub.upsertSkill(parsed.value), { status: 201 });
    }

    if (url.pathname === "/api/skills/import" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpSkillImport);
      if (!parsed.ok) return parsed.response;
      return Response.json(
        { installed: await stub.importSkill(parsed.value.source) },
        { status: 201 },
      );
    }

    if (url.pathname === "/api/mcp/oauth" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpMcpOAuth);
      if (!parsed.ok) return parsed.response;
      return Response.json(
        await stub.connectMcpOAuth(parsed.value.name, parsed.value.url, url.origin),
      );
    }

    if (url.pathname === "/api/codemode" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpCodemode);
      if (!parsed.ok) return parsed.response;
      return Response.json(await stub.runCodemode(parsed.value.code, parsed.value.params));
    }

    if (url.pathname.startsWith("/api/sessions/") && request.method === "PATCH") {
      const sessionId = decodeURIComponent(url.pathname.slice("/api/sessions/".length));
      const parsed = await parseJsonBody(request, validators.httpSessionConfigure);
      if (!parsed.ok) return parsed.response;
      return Response.json(await stub.configureSession(sessionId, parsed.value));
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const parsed = await parseJsonBody(request, validators.httpChat);
      if (!parsed.ok) return parsed.response;
      return Response.json(
        await stub.chatPrompt(parsed.value.text, parsed.value.sessionId, {
          model: parsed.value.model,
          thinkingLevel: parsed.value.thinkingLevel,
        }),
      );
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const allowedDomain = env.EMAIL_DOMAIN?.trim().toLowerCase();
    const to = (message.to || "").trim();
    if (allowedDomain) {
      const atIdx = to.lastIndexOf("@");
      const recipientDomain = atIdx >= 0 ? to.slice(atIdx + 1).toLowerCase() : "";
      if (recipientDomain !== allowedDomain) {
        message.setReject(`Recipient domain "${recipientDomain}" is not allowed`);
        return;
      }
    }
    const owner = env.EMAIL_OWNER?.trim() || to || "owner@local";
    const subject = message.headers.get("subject") ?? "(no subject)";
    const raw = await new Response(message.raw).text();
    const stub = env.TOCK_DO.get(env.TOCK_DO.idFromName(owner));
    await stub.handleEmail(message.from, to, subject, raw);
  },
};
