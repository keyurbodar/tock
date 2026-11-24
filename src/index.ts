import { authenticateRequest } from "./core/auth.js";
import { parseJsonBody, validators } from "./core/schemas.js";
import type { Env } from "./types.js";

export { TockDO } from "./do.js";

const MAX_WEBHOOK_BYTES = 256 * 1024;

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

    const auth = await authenticateRequest(request, env);
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
        request.headers.get("x-file-name") || url.searchParams.get("name") || "upload.bin";
      const mime = request.headers.get("content-type") || "application/octet-stream";
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      const bytes = new Uint8Array(await request.arrayBuffer());
      return Response.json(await stub.uploadFile(name, mime, bytes, sessionId), { status: 201 });
    }

    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      const fileId = decodeURIComponent(url.pathname.slice("/api/files/".length));
      const found = await stub.getFile(fileId);
      if (!found) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
      return new Response(found.bytes, {
        headers: {
          "content-type": found.meta.mime,
          "content-disposition": `inline; filename="${found.meta.name}"`,
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
