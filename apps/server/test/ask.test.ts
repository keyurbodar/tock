import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type MutableModels } from "@earendil-works/pi-ai";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

type Frame = { id?: string; type: string; data?: unknown; event?: string; payload?: unknown };

describe("ask_owner", () => {
  it("pauses the run until the owner answers, then resumes with the answer as the tool result", async () => {
    const owner = "ask-owner@test";
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName(owner)) as DurableObjectStub<TockDO>;
    await runInDurableObject(stub, async (instance) => {
      const faux = fauxProvider();
      (instance as unknown as { models: MutableModels }).models.setProvider(faux.provider);
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall("ask_owner", { kind: "approval", question: "Deploy?", summary: "Ships the fix" })], { stopReason: "toolUse" }),
        fauxAssistantMessage(fauxText("Deployed.")),
      ]);
      const model = faux.getModel();
      await instance.updateSettings({ model: `${model.provider}/${model.id}` });
    });
    const res = await SELF.fetch("https://tock.local/ws", { headers: { upgrade: "websocket", "x-tock-owner": owner } });
    const ws = res.webSocket!;
    ws.accept();
    const frames: Frame[] = [];
    ws.addEventListener("message", (ev) => frames.push(JSON.parse(String(ev.data))));
    let n = 0;
    const until = async <T>(read: () => T | undefined, what: string): Promise<T> => {
      for (let t = 0; t < 250; t++) {
        const v = read();
        if (v !== undefined) return v;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    const request = async (type: string, body: Record<string, unknown> = {}) => {
      const id = `r${n++}`;
      ws.send(JSON.stringify({ id, type, ...body }));
      return until(() => frames.find((f) => f.id === id && (f.type === "ok" || f.type === "error")), type);
    };
    const sessionId = crypto.randomUUID();
    await request("chat.subscribe", { sessionId });
    expect((await request("chat.send", { sessionId, text: "ship it" })).type).toBe("ok");

    const pending = await until(() => frames.find((f) => f.event === "ask.pending"), "ask.pending");
    expect(pending.payload).toMatchObject({ ask: { kind: "approval", question: "Deploy?", options: ["Approve", "Deny"] } });
    const needs = await until(() => frames.find((f) => f.event === "session.needs" && (f.payload as { needs?: unknown }).needs), "session.needs");
    expect(needs.payload).toEqual({ sessionId, needs: "Deploy?" });
    const listed = (await request("session.list")).data as Array<{ id: string; needs?: string | null }>;
    expect(listed.find((s) => s.id === sessionId)?.needs).toBe("Deploy?");
    const sub = await request("chat.subscribe", { sessionId });
    expect((sub.data as { ask?: unknown }).ask).toMatchObject({ question: "Deploy?" });
    expect(JSON.stringify((sub.data as { messages: unknown }).messages)).not.toContain("pi.tool-result");

    expect((await request("ask.answer", { sessionId, answer: "Approve" })).data).toEqual({ answered: true });
    await until(() => frames.find((f) => f.event === "ask.settled"), "ask.settled");
    await until(() => frames.find((f) => f.event === "session.needs" && (f.payload as { needs?: unknown }).needs === null), "session.needs cleared");
    const after = (await request("session.list")).data as Array<{ id: string; needs?: string | null }>;
    expect(after.find((s) => s.id === sessionId)?.needs).toBeNull();
    const done = await (async () => {
      for (let t = 0; t < 250; t++) {
        const r = await request("session.messages", { sessionId });
        const list = (r.data as Array<{ model?: Array<{ role: string; toolName?: string; content: unknown }> }>).flatMap((e) => e.model ?? []);
        if (list.some((m) => m.role === "assistant" && JSON.stringify(m.content).includes("Deployed."))) return list;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("run never finished");
    })();
    const result = done.find((m) => m.role === "toolResult" && m.toolName === "ask_owner");
    expect(JSON.stringify(result?.content)).toContain('{\\"answer\\":\\"Approve\\"}');
    expect((await request("ask.answer", { sessionId, answer: "Approve" })).type).toBe("error");
    ws.close();
  }, 20_000);
  it("carries several questions in one ask and keeps single-question asks unchanged", async () => {
    const owner = "ask-owner-many@test";
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName(owner)) as DurableObjectStub<TockDO>;
    const questions = [
      { question: "Which branch?", options: ["main", "release/2.4"] },
      { question: "Open a pull request?", options: ["Yes", "No"] },
    ];
    await runInDurableObject(stub, async (instance) => {
      const faux = fauxProvider();
      (instance as unknown as { models: MutableModels }).models.setProvider(faux.provider);
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall("ask_owner", { kind: "question", question: "Two choices", questions })], { stopReason: "toolUse" }),
        fauxAssistantMessage(fauxText("Done.")),
      ]);
      const model = faux.getModel();
      await instance.updateSettings({ model: `${model.provider}/${model.id}` });
    });
    const res = await SELF.fetch("https://tock.local/ws", { headers: { upgrade: "websocket", "x-tock-owner": owner } });
    const ws = res.webSocket!;
    ws.accept();
    const frames: Frame[] = [];
    ws.addEventListener("message", (ev) => frames.push(JSON.parse(String(ev.data))));
    let n = 0;
    const until = async <T>(read: () => T | undefined, what: string): Promise<T> => {
      for (let t = 0; t < 250; t++) {
        const v = read();
        if (v !== undefined) return v;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    const request = async (type: string, body: Record<string, unknown> = {}) => {
      const id = `r${n++}`;
      ws.send(JSON.stringify({ id, type, ...body }));
      return until(() => frames.find((f) => f.id === id && (f.type === "ok" || f.type === "error")), type);
    };
    const sessionId = crypto.randomUUID();
    await request("chat.subscribe", { sessionId });
    await request("chat.send", { sessionId, text: "two questions" });
    const pending = await until(() => frames.find((f) => f.event === "ask.pending"), "ask.pending");
    expect(pending.payload).toMatchObject({ ask: { kind: "question", question: "Two choices", options: ["main", "release/2.4"], questions } });
    const answer = "Which branch?: main\nOpen a pull request?: Yes";
    expect((await request("ask.answer", { sessionId, answer })).data).toEqual({ answered: true });
    await until(() => frames.find((f) => f.event === "ask.settled"), "ask.settled");
    ws.close();
  }, 20_000);
});
