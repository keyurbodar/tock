import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxProvider, type MutableModels } from "@earendil-works/pi-ai";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

type Frame = { id?: string; type: string; data?: unknown; error?: unknown };

async function connect(owner: string) {
  const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName(owner)) as DurableObjectStub<TockDO>;
  await runInDurableObject(stub, async (instance) => {
    const faux = fauxProvider();
    (instance as unknown as { models: MutableModels }).models.setProvider(faux.provider);
    faux.setResponses(Array.from({ length: 5 }, (_, i) => fauxAssistantMessage(`reply ${i}`)));
    const model = faux.getModel();
    await instance.updateSettings({ model: `${model.provider}/${model.id}` });
  });
  const res = await SELF.fetch("https://tock.local/ws", { headers: { upgrade: "websocket", "x-tock-owner": owner } });
  const ws = res.webSocket!;
  ws.accept();
  const frames: Frame[] = [];
  ws.addEventListener("message", (ev) => frames.push(JSON.parse(String(ev.data))));
  let n = 0;
  const request = async (type: string, body: Record<string, unknown> = {}) => {
    const id = `r${n++}`;
    ws.send(JSON.stringify({ id, type, ...body }));
    for (let t = 0; t < 200; t++) {
      const reply = frames.find((f) => f.id === id && (f.type === "ok" || f.type === "error"));
      if (reply) return reply;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no reply to ${type}`);
  };
  return { ws, request };
}

type Listed = { id: string; meta: { title: string | null; pinned: boolean; archived: boolean; unread: boolean } };

describe("thread metadata", () => {
  it("renames, pins, archives and deletes a thread by its public id", async () => {
    const { ws, request } = await connect("threads-meta@test");
    const threadId = crypto.randomUUID();
    expect((await request("chat.send", { sessionId: threadId, text: "hello" })).type).toBe("ok");

    const updated = await request("thread.update", { threadId, title: "  Trip notes ", pinned: true, archived: true, unread: true });
    expect(updated.data).toEqual({ threadId, meta: { title: "Trip notes", pinned: true, archived: true, unread: true } });

    const listed = (await request("session.list")).data as Listed[];
    expect(listed.find((s) => s.id === threadId)?.meta).toEqual({ title: "Trip notes", pinned: true, archived: true, unread: true });

    expect((await request("thread.delete", { threadId })).data).toEqual({ deleted: true });
    const after = (await request("session.list")).data as Listed[];
    expect(after.some((s) => s.id === threadId)).toBe(false);
    expect((await request("thread.update", { threadId, pinned: false })).type).toBe("error");
    ws.close();
  });
});
