import { authenticateRequest } from "./core/auth.js";
import type { Env } from "./types.js";

export { TockDO } from "./do.js";

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
      const payload = await request.json().catch(() => ({}));
      const stub = env.TOCK_DO.get(env.TOCK_DO.idFromName(owner));
      const res = await stub.handleWebhook(hookId, token, payload);
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

    if (url.pathname === "/api/settings" && request.method === "PATCH") {
      const patch = (await request.json()) as Record<string, unknown>;
      return Response.json(await stub.updateSettings(patch));
    }

    if (url.pathname === "/api/secrets" && request.method === "GET") {
      return Response.json({ secrets: await stub.listSecrets() });
    }

    if (url.pathname === "/api/secrets" && request.method === "POST") {
      const body = (await request.json()) as { name: string; value: string; description?: string; scopes?: string };
      return Response.json(await stub.setSecret(body.name, body.value, body.description, body.scopes));
    }

    if (url.pathname === "/api/mcp/oauth" && request.method === "POST") {
      const body = (await request.json()) as { name: string; url: string };
      return Response.json(await stub.connectMcpOAuth(body.name, body.url, url.origin));
    }

    if (url.pathname === "/api/codemode" && request.method === "POST") {
      const body = (await request.json()) as { code: string; params?: Record<string, unknown> };
      return Response.json(await stub.runCodemode(body.code, body.params));
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = (await request.json()) as { text: string; sessionId?: string };
      return Response.json(await stub.chatPrompt(body.text, body.sessionId));
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
};
