import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type MutableModels } from "@earendil-works/pi-ai";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

type Frame = { id?: string; type: string; data?: unknown; event?: string; payload?: unknown };
type Message = { role: string; toolName?: string; content: unknown };
type Queued = { operationId: string; text: string };

async function connect(owner: string, responses: ReturnType<typeof fauxAssistantMessage>[]) {
  const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName(owner)) as DurableObjectStub<TockDO>;
  await runInDurableObject(stub, async (instance) => {
    const faux = fauxProvider();
    (instance as unknown as { models: MutableModels }).models.setProvider(faux.provider);
    faux.setResponses(responses);
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
    for (let t = 0; t < 400; t++) {
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
  const messages = async (sessionId: string) => {
    const r = await request("session.messages", { sessionId });
    return (r.data as Array<{ model?: Message[] }>).flatMap((e) => e.model ?? []);
  };
  const reply = async (sessionId: string, text: string) => {
    for (let t = 0; t < 400; t++) {
      const list = await messages(sessionId);
      if (list.some((m) => m.role === "assistant" && JSON.stringify(m.content).includes(text))) return list;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no reply containing ${text}`);
  };
  return { ws, frames, until, request, messages, reply };
}

const askBranch = () =>
  fauxAssistantMessage([fauxToolCall("ask_owner", { kind: "question", question: "Which branch?", options: ["main", "release/2.4"] })], { stopReason: "toolUse" });
const userTexts = (list: Message[]) => list.filter((m) => m.role === "user").map((m) => JSON.stringify(m.content));

describe("queued sends", () => {
  it("acks by operationId, dedupes a resend, and lists queued sends by id", async () => {
    const c = await connect("queue-ack@test", [askBranch(), fauxAssistantMessage(fauxText("Based on main.")), fauxAssistantMessage(fauxText("Queued handled."))]);
    const sessionId = crypto.randomUUID();
    await c.request("chat.subscribe", { sessionId });
    await c.request("chat.send", { sessionId, text: "pick a branch", operationId: "op-first" });
    await c.until(() => c.frames.find((f) => f.event === "ask.pending"), "ask.pending");

    const first = await c.request("chat.send", { sessionId, text: "queued behind the ask", operationId: "op-queued" });
    expect(first.data).toMatchObject({ operationId: "op-queued", accepted: true });
    const again = await c.request("chat.send", { sessionId, text: "queued behind the ask", operationId: "op-queued" });
    expect(again.data).toMatchObject({ operationId: "op-queued", accepted: false });
    const accepted = c.frames.filter((f) => f.event === "chat.accepted").map((f) => (f.payload as { operationId: string }).operationId);
    expect(accepted).toContain("op-queued");

    const sub = await c.request("chat.subscribe", { sessionId });
    expect((sub.data as { queued: Queued[] }).queued).toEqual([{ operationId: "op-queued", text: "queued behind the ask" }]);

    await c.request("ask.answer", { sessionId, answer: "main" });
    const list = await c.reply(sessionId, "Queued handled.");
    expect(userTexts(list).filter((t) => t.includes("queued behind the ask"))).toHaveLength(1);
    const empty = await c.request("chat.subscribe", { sessionId });
    expect((empty.data as { queued: Queued[] }).queued).toEqual([]);
    c.ws.close();
  }, 30_000);

  it("delivers an ask answer while a message is queued, and keeps the queued message", async () => {
    const c = await connect("queue-ask@test", [askBranch(), fauxAssistantMessage(fauxText("Based on main.")), fauxAssistantMessage(fauxText("Running the long job."))]);
    const sessionId = crypto.randomUUID();
    await c.request("chat.subscribe", { sessionId });
    await c.request("chat.send", { sessionId, text: "help me pick a branch", operationId: "op-ask" });
    await c.until(() => c.frames.find((f) => f.event === "ask.pending"), "ask.pending");
    await c.request("chat.send", { sessionId, text: "run the long job", operationId: "op-long" });

    expect((await c.request("ask.answer", { sessionId, answer: "main" })).data).toEqual({ answered: true });
    const list = await c.reply(sessionId, "Running the long job.");
    const result = list.find((m) => m.role === "toolResult" && m.toolName === "ask_owner");
    expect(JSON.stringify(result?.content)).toContain("main");
    expect(list.some((m) => m.role === "assistant" && JSON.stringify(m.content).includes("Based on main."))).toBe(true);
    expect(userTexts(list).some((t) => t.includes("run the long job"))).toBe(true);
    c.ws.close();
  }, 30_000);

  it("Stop aborts the run but keeps the queued send, which then runs", async () => {
    const c = await connect("queue-abort@test", [askBranch(), fauxAssistantMessage(fauxText("Second answered."))]);
    const sessionId = crypto.randomUUID();
    await c.request("chat.subscribe", { sessionId });
    await c.request("chat.send", { sessionId, text: "help me pick a branch", operationId: "op-run" });
    await c.until(() => c.frames.find((f) => f.event === "ask.pending"), "ask.pending");
    await c.request("chat.send", { sessionId, text: "second message queued", operationId: "op-second" });

    const stopped = await c.request("chat.abort", { sessionId });
    expect(stopped.type).toBe("ok");
    expect((stopped.data as { aborted: boolean }).aborted).toBe(true);
    const list = await c.reply(sessionId, "Second answered.");
    expect(userTexts(list).some((t) => t.includes("second message queued"))).toBe(true);
    c.ws.close();
  }, 30_000);

  it("Stop on a chat waiting on an ask settles the ask for every surface", async () => {
    const c = await connect("queue-abort-ask@test", [askBranch()]);
    const sessionId = crypto.randomUUID();
    await c.request("chat.subscribe", { sessionId });
    await c.request("chat.send", { sessionId, text: "help me pick a branch", operationId: "op-ask" });
    await c.until(() => c.frames.find((f) => f.event === "ask.pending"), "ask.pending");

    await c.request("chat.abort", { sessionId });
    await c.until(() => c.frames.find((f) => f.event === "ask.settled"), "ask.settled");
    await c.until(() => c.frames.find((f) => f.event === "session.needs" && (f.payload as { needs: unknown }).needs === null), "session.needs cleared");
    const sub = await c.request("chat.subscribe", { sessionId });
    expect((sub.data as { ask?: unknown }).ask).toBeUndefined();
    const listed = (await c.request("session.list")).data as Array<{ id: string; needs?: unknown }>;
    const row = listed.find((s) => s.id === sessionId);
    expect(row).toBeDefined();
    expect(row?.needs ?? null).toBeNull();
    expect((await c.request("ask.answer", { sessionId, answer: "main" })).type).toBe("error");
    c.ws.close();
  }, 30_000);
});
