import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type MutableModels } from "@earendil-works/pi-ai";
import { followupsOf } from "@tock/protocol";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

type Frame = { id?: string; type: string; data?: unknown; event?: string; payload?: unknown };
type Entry = { model?: Array<{ role: string; content: unknown; toolName?: string }> };

const suggestions = [
  { emoji: "🔀", label: "Open the PR", prompt: "Open a pull request for the fix." },
  { emoji: "🧪", label: "Run tests", prompt: "Run the suite twenty times." },
  { emoji: "📝", label: "Release notes", prompt: "Draft the release note." },
  { emoji: "🚫", label: "A fourth one", prompt: "Never shown." },
  { emoji: "", label: "", prompt: "no label" },
];

describe("suggest_followups", () => {
  it("keeps the turn's follow-ups in its transcript, so a fresh subscribe (a reload) reads them back", async () => {
    const owner = "followups@test";
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName(owner)) as DurableObjectStub<TockDO>;
    await runInDurableObject(stub, async (instance) => {
      const faux = fauxProvider();
      (instance as unknown as { models: MutableModels }).models.setProvider(faux.provider);
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall("suggest_followups", { suggestions })], { stopReason: "toolUse" }),
        fauxAssistantMessage(fauxText("Fixed.")),
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
    expect((await request("chat.send", { sessionId, text: "fix the login loop" })).type).toBe("ok");
    const settled = async () => {
      for (let t = 0; t < 250; t++) {
        const r = await request("session.messages", { sessionId });
        const list = (r.data as Entry[]).flatMap((e) => e.model ?? []);
        if (list.some((m) => m.role === "assistant" && JSON.stringify(m.content).includes("Fixed."))) return list;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("run never finished");
    };
    await settled();
    const sub = await request("chat.subscribe", { sessionId });
    const list = ((sub.data as { messages: Entry[] }).messages ?? []).flatMap((e) => e.model ?? []);
    const call = list
      .flatMap((m) => (m.role === "assistant" && Array.isArray(m.content) ? (m.content as Array<{ type: string; name?: string; arguments?: Record<string, unknown> }>) : []))
      .find((block) => block.type === "toolCall" && block.name === "suggest_followups");
    expect(call).toBeDefined();
    expect(followupsOf(call!.arguments!)).toEqual(suggestions.slice(0, 3));
    const result = list.find((m) => m.role === "toolResult" && m.toolName === "suggest_followups");
    expect(JSON.stringify(result?.content)).toContain('\\"shown\\":3');
    expect(frames.some((f) => f.event?.includes("followup"))).toBe(false);
    ws.close();
  }, 20_000);
});
