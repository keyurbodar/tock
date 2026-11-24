import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ExecutionGuards } from "../src/core/guards.js";
import { SubagentPool } from "../src/core/subagents.js";
import type { SettingsStore } from "../src/core/settings.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

describe("tock backend", () => {
  it("responds healthy on /api/health", async () => {
    const res = await SELF.fetch("https://tock.local/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "tock" });
  });

  it("enforces fail-closed auth when DEV_ALLOW_ANON is off", async () => {
    const { authenticateRequest } = await import("../src/core/auth.js");
    const lockedEnv = { ...testEnv, DEV_ALLOW_ANON: "0", ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" };
    const result = await authenticateRequest(
      new Request("https://tock.local/api/status"),
      lockedEnv,
    );
    expect(result).toEqual({ ok: false, reason: "access_not_configured" });
  });

  it("persists owner settings including configurable maxSubagents and devMode", async () => {
    const res1 = await SELF.fetch("https://tock.local/api/status", {
      headers: { "x-tock-owner": "settings@test" },
    });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { settings: { maxSubagents: number; devMode: boolean } };
    expect(body1.settings.maxSubagents).toBe(3);
    expect(body1.settings.devMode).toBe(false);

    const res2 = await SELF.fetch("https://tock.local/api/settings", {
      method: "PATCH",
      headers: { "x-tock-owner": "settings@test", "content-type": "application/json" },
      body: JSON.stringify({ maxSubagents: 6, devMode: true }),
    });
    expect(res2.status).toBe(200);
    const updated = (await res2.json()) as { maxSubagents: number; devMode: boolean };
    expect(updated.maxSubagents).toBe(6);
    expect(updated.devMode).toBe(true);
  });

  it("changes model and reasoning level mid-session without resetting the thread", async () => {
    const res = await SELF.fetch("https://tock.local/api/sessions/1", {
      method: "PATCH",
      headers: { "x-tock-owner": "switch@test", "content-type": "application/json" },
      body: JSON.stringify({ model: "opencode-go/deepseek-v4.1-flash", thinkingLevel: "high" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId: "1",
      model: { provider: "opencode-go", id: "deepseek-v4.1-flash" },
      thinkingLevel: "high",
    });

    const res2 = await SELF.fetch("https://tock.local/api/sessions/1", {
      method: "PATCH",
      headers: { "x-tock-owner": "switch@test", "content-type": "application/json" },
      body: JSON.stringify({ thinkingLevel: "off" }),
    });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ sessionId: "1", thinkingLevel: "off" });
  });

  it("lists built-in opencode-go models dynamically with per-model reasoning capabilities", async () => {
    const res = await SELF.fetch("https://tock.local/api/models?provider=opencode-go", {
      headers: { "x-tock-owner": "models@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      models: Array<{ provider: string; id: string; reasoning: boolean; thinkingLevels: string[] }>;
    };
    expect(body.models.length).toBeGreaterThan(0);
    expect(
      body.models.every((m) => Array.isArray(m.thinkingLevels) && m.thinkingLevels.length >= 1),
    ).toBe(true);
  });

  it("encrypts secrets in AES-256-GCM vault and never leaks plaintext metadata", async () => {
    const saveRes = await SELF.fetch("https://tock.local/api/secrets", {
      method: "POST",
      headers: { "x-tock-owner": "vault@test", "content-type": "application/json" },
      body: JSON.stringify({
        name: "github_pat",
        value: "ghp_super_secret_value_999",
        description: "GitHub token",
        scopes: "repo",
      }),
    });
    expect(saveRes.status).toBe(200);

    const listRes = await SELF.fetch("https://tock.local/api/secrets", {
      headers: { "x-tock-owner": "vault@test" },
    });
    const listBody = (await listRes.json()) as {
      secrets: Array<{ name: string; description: string }>;
    };
    expect(listBody.secrets).toHaveLength(1);
    expect(listBody.secrets[0]?.name).toBe("github_pat");
    expect(JSON.stringify(listBody)).not.toContain("ghp_super_secret_value_999");
  });

  it("uploads, lists, and reads files with SQLite fallback when R2 is unbound and inside codemode", async () => {
    const upRes = await SELF.fetch("https://tock.local/api/files?name=notes.txt", {
      method: "POST",
      headers: { "x-tock-owner": "files@test", "content-type": "text/plain" },
      body: "Hub Block launch checklist: 1. Ship tock.",
    });
    expect(upRes.status).toBe(201);
    const meta = (await upRes.json()) as { id: string; name: string; storageKind: string };
    expect(meta.name).toBe("notes.txt");
    expect(meta.storageKind).toBe("sqlite");

    const dlRes = await SELF.fetch(`https://tock.local/api/files/${meta.id}`, {
      headers: { "x-tock-owner": "files@test" },
    });
    expect(dlRes.status).toBe(200);
    expect(await dlRes.text()).toBe("Hub Block launch checklist: 1. Ship tock.");

    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("files@test"));
    const cm = await stub.runCodemode(
      `
      const f = await tock.readFile(id);
      const saved = await tock.writeFile("out.txt", f.text.toUpperCase(), "text/plain");
      return { orig: f.name, savedId: saved.id };
      `,
      { id: meta.id },
    );
    expect(cm.ok).toBe(true);
    const parsed = JSON.parse(cm.valueJson ?? "{}") as { orig: string; savedId: string };
    expect(parsed.orig).toBe("notes.txt");
    expect(parsed.savedId.length).toBeGreaterThan(10);
  });

  it("installs and lists skills via direct SKILL.md upsert", async () => {
    const res = await SELF.fetch("https://tock.local/api/skills", {
      method: "POST",
      headers: { "x-tock-owner": "skills@test", "content-type": "application/json" },
      body: JSON.stringify({
        bodyMd:
          "---\nname: linear-api\ndescription: Manage Linear issues over REST\n---\n# Linear API\nUse http_request.",
      }),
    });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { name: string; description: string };
    expect(saved.name).toBe("linear-api");
    expect(saved.description).toBe("Manage Linear issues over REST");

    const listRes = await SELF.fetch("https://tock.local/api/skills", {
      headers: { "x-tock-owner": "skills@test" },
    });
    const listBody = (await listRes.json()) as { skills: Array<{ name: string }> };
    expect(listBody.skills.map((s) => s.name)).toContain("linear-api");
  });

  it("filters webhooks deterministically via dev_mode djs webhook_filter plugins", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("hooks@test"));
    await stub.updateSettings({ devMode: true });
    await stub.setSecret("webhook_gh", "hook-secret-123");
    await stub.upsertPlugin({
      name: "only-main-push",
      kind: "webhook_filter",
      description: "Only wake agent on pushes to main",
      schemaJson: "{}",
      tsSource: `return { pass: payload.ref === "refs/heads/main", summary: "Push to main by " + payload.pusher };`,
      enabled: true,
    });

    const skipRes = await stub.handleWebhook(
      "gh",
      "hook-secret-123",
      { ref: "refs/heads/dev", pusher: "bot" },
      "only-main-push",
    );
    expect(skipRes).toEqual({ accepted: true, filtered: true });

    const passRes = await stub.handleWebhook(
      "gh",
      "hook-secret-123",
      { ref: "refs/heads/main", pusher: "keyur" },
      "only-main-push",
    );
    expect(passRes).toEqual({ accepted: true, filtered: false });
  });

  it("provides unified cross-thread FTS5 memory and open items via batched writes", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("memory@test"));
    const write1 = await stub.writeMemory({
      coreContent: "User manages Hub Block content tasks every Tuesday.",
      addItems: [
        {
          kind: "fact",
          content: "Hub Block newsletter ships on Tuesdays with 3 founder spotlights",
        },
        { kind: "preference", content: "Prefer Bun and tsgo over npm and tsc" },
      ],
      upsertOpenItems: [
        { title: "Review Hub Block Q4 calendar", context: "Waiting on draft links" },
      ],
    });
    expect(write1.addedIds).toHaveLength(2);
    expect(write1.openIds).toHaveLength(1);

    const hits = await stub.searchMemory("Hub Block newsletter", 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.content).toContain("Hub Block");

    const ctx = await stub.renderAutoContext("Hub Block");
    expect(ctx).toContain("Core Memory");
    expect(ctx).toContain("Open Items");
    expect(ctx).toContain("Review Hub Block Q4 calendar");
  });

  it("runs zero-LLM djs watch routines and only wakes the model when state changes", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("watch@test"));
    const r1 = await stub.upsertRoutine({
      name: "repo-watch",
      schedule: "600",
      scheduleType: "interval",
      prompt: "Notify user about new commits",
      checkScript: `return { sha: "empty" };`,
      quietIfUnchanged: true,
      enabled: true,
    });

    const first = await stub.triggerRoutineNow(r1.id);
    expect(first).toEqual({ ran: true, skippedUnchanged: true, wokeModel: false });

    const second = await stub.triggerRoutineNow(r1.id);
    expect(second).toEqual({ ran: true, skippedUnchanged: true, wokeModel: false });

    await stub.upsertRoutine({
      id: r1.id,
      name: "repo-watch",
      schedule: "600",
      scheduleType: "interval",
      prompt: "Notify user about new commits",
      checkScript: `return { sha: "9423388" };`,
      quietIfUnchanged: true,
      enabled: true,
    });

    const third = await stub.triggerRoutineNow(r1.id);
    expect(third).toEqual({ ran: true, skippedUnchanged: false, wokeModel: true });
  });

  it("executes TypeScript codemode inside @earendil-works/djs WASM sandbox with memory access and fuel caps", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("djs@test"));
    await stub.writeMemory({
      addItems: [{ kind: "fact", content: "Project tock runs on Cloudflare Workers Free Plan" }],
    });

    const okRun = await stub.runCodemode(
      `
      const items: Array<{ content: string }> = await tock.memorySearch("Cloudflare Free Plan", 3);
      const count: number = items.length;
      console.log("found", count);
      return { count, first: items[0]?.content ?? null };
      `,
    );
    if (!okRun.ok) throw new Error("DJS_ERR: " + okRun.error);
    expect(okRun.ok).toBe(true);
    const parsed = JSON.parse(okRun.valueJson ?? "{}") as { count: number; first: string };
    expect(parsed.count).toBeGreaterThanOrEqual(1);
    expect(parsed.first).toContain("Cloudflare Workers Free Plan");
    expect(okRun.logs[0]).toBe("found 1");

    const fuelRun = await stub.runCodemode(`let x = 0; while (true) { x++; } return x;`);
    expect(fuelRun.ok).toBe(false);
    expect(fuelRun.error?.toLowerCase()).toContain("fuel");
  });

  it("enforces durable subagent concurrency limits and loop/subrequest guards", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("subagent@test"));
    await runInDurableObject(stub, async (_instance, state) => {
      const fakeSettings = { get: () => ({ maxSubagents: 2 }) } as unknown as SettingsStore;
      const pool = new SubagentPool(state.storage.sql, fakeSettings);
      await pool.acquire("t1", "c1");
      await pool.acquire("t2", "c2");
      expect(pool.runningCount).toBe(2);

      let t3Acquired = false;
      const p3 = pool.acquire("t3", "c3").then(() => {
        t3Acquired = true;
      });
      await Promise.resolve();
      expect(t3Acquired).toBe(false);
      expect(pool.queuedCount).toBe(1);

      pool.release("t1");
      await p3;
      expect(t3Acquired).toBe(true);
      expect(pool.runningCount).toBe(2);

      const poolAfterRestart = new SubagentPool(state.storage.sql, fakeSettings);
      expect(poolAfterRestart.runningCount).toBe(2);
      poolAfterRestart.release("t2");
      poolAfterRestart.release("t3");
      expect(poolAfterRestart.runningCount).toBe(0);
    });

    const guards = new ExecutionGuards({ maxConsecutiveIdentical: 2, maxSubrequestsPerSlice: 3 });
    expect(guards.checkLoop("s1", "mcp_call", { a: 1 }).blocked).toBe(false);
    expect(guards.checkLoop("s1", "mcp_call", { a: 1 }).blocked).toBe(false);
    expect(guards.checkLoop("s1", "mcp_call", { a: 1 }).blocked).toBe(true);

    expect(guards.recordSubrequest(2).allowed).toBe(true);
    expect(guards.recordSubrequest(2).allowed).toBe(false);
  });
});
