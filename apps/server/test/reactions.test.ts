import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type MutableModels } from "@earendil-works/pi-ai";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

type Frame = { id?: string; type: string; data?: unknown; event?: string; payload?: unknown };
type Entry = { id: string; model?: Array<{ role: string; toolName?: string; content: unknown }> };

async function connect(owner: string, responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0]) {
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
  const settled = async (sessionId: string, word: string) => {
    for (let t = 0; t < 250; t++) {
      const entries = (await request("session.messages", { sessionId })).data as Entry[];
      if (entries.some((e) => (e.model ?? []).some((m) => m.role === "assistant" && JSON.stringify(m.content).includes(word)))) return entries;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("run never finished");
  };
  return { ws, frames, until, request, settled };
}

describe("reactions", () => {
  it("toggles a reaction, broadcasts it unpersisted, and lists it again on a resubscribe", async () => {
    const { ws, frames, until, request, settled } = await connect("reactions@test", [fauxAssistantMessage(fauxText("Hello there."))]);
    const sessionId = crypto.randomUUID();
    await request("chat.subscribe", { sessionId });
    await request("chat.send", { sessionId, text: "hi toast" });
    const entries = await settled(sessionId, "Hello there.");
    const user = entries.find((e) => e.model?.some((m) => m.role === "user"))!;
    const ref = `${user.id}:${user.model!.findIndex((m) => m.role === "user")}`;

    const on = await request("reaction.set", { sessionId, ref, emoji: "👍", on: true });
    expect(on).toMatchObject({ type: "ok", data: { ref, changed: true } });
    const event = await until(() => frames.find((f) => f.event === "reaction"), "reaction event");
    expect(event.payload).toMatchObject({ sessionId, ref, emoji: "👍", by: "me", on: true, latest: { by: "me", emoji: "👍", excerpt: "hi toast" } });
    expect((await request("reaction.set", { sessionId, ref, emoji: "👍", on: true })).data).toEqual({ ref, changed: false });
    await request("reaction.set", { sessionId, ref, emoji: "❤️", on: true });

    const listed = (await request("session.list")).data as Array<{ id: string; reaction?: { emoji: string; by: string; excerpt: string } | null }>;
    expect(listed.find((s) => s.id === sessionId)?.reaction).toMatchObject({ by: "me", emoji: "❤️", excerpt: "hi toast" });

    ws.close();
    const again = await connect("reactions@test", [fauxAssistantMessage(fauxText("unused"))]);
    const sub = (await again.request("chat.subscribe", { sessionId })).data as { reactions: Record<string, Array<{ emoji: string; by: string }>> };
    expect(sub.reactions[ref]?.map((r) => r.emoji)).toEqual(["👍", "❤️"]);

    expect(await again.request("reaction.set", { sessionId, ref, emoji: "👍", on: false })).toMatchObject({ type: "ok", data: { ref, changed: true } });
    const off = await again.until(() => again.frames.find((f) => f.event === "reaction" && (f.payload as { on: boolean }).on === false), "removal");
    expect(off.payload).toMatchObject({ emoji: "👍", on: false });
    const after = (await again.request("chat.subscribe", { sessionId })).data as { reactions: Record<string, Array<{ emoji: string }>> };
    expect(after.reactions[ref]?.map((r) => r.emoji)).toEqual(["❤️"]);
    expect((await again.request("reaction.set", { sessionId, ref: "not a ref", emoji: "👍", on: true })).type).toBe("error");
    again.ws.close();
  }, 20_000);

  it("lets the agent react to the owner's latest message without breaking the run", async () => {
    const { ws, frames, until, request, settled } = await connect("reactions-agent@test", [
      fauxAssistantMessage(fauxText("First.")),
      fauxAssistantMessage([fauxToolCall("react", { emoji: "🎉" })], { stopReason: "toolUse" }),
      fauxAssistantMessage(fauxText("Shipped, nice work.")),
    ]);
    const sessionId = crypto.randomUUID();
    await request("chat.subscribe", { sessionId });
    await request("chat.send", { sessionId, text: "first message" });
    await settled(sessionId, "First.");
    await request("chat.send", { sessionId, text: "it shipped" });
    const entries = await settled(sessionId, "Shipped, nice work.");
    const users = entries.flatMap((e) => (e.model ?? []).flatMap((m, i) => (m.role === "user" ? [`${e.id}:${i}`] : [])));
    const event = await until(() => frames.find((f) => f.event === "reaction"), "agent reaction");
    expect(event.payload).toMatchObject({ sessionId, ref: users.at(-1), emoji: "🎉", by: "toast", on: true, latest: { by: "toast", excerpt: "it shipped" } });
    const result = entries.flatMap((e) => e.model ?? []).find((m) => m.role === "toolResult" && m.toolName === "react");
    expect(JSON.stringify(result?.content)).toContain("🎉");
    const sub = (await request("chat.subscribe", { sessionId })).data as { reactions: Record<string, Array<{ by: string }>> };
    expect(sub.reactions[users.at(-1)!]?.[0]?.by).toBe("toast");
    ws.close();
  }, 20_000);
});
