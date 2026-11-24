import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxProvider, type MutableModels } from "@earendil-works/pi-ai";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";

const testEnv = env as unknown as Env;

type Meter = { rows: () => number; reset: () => void };

function installMeter(storage: DurableObjectStorage): Meter {
  const sql = storage.sql;
  const original = sql.exec.bind(sql);
  let cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];
  sql.exec = ((query: string, ...bindings: unknown[]) => {
    const cursor = original(query, ...bindings);
    cursors.push(cursor);
    return cursor;
  }) as typeof sql.exec;
  return {
    rows: () => cursors.reduce((sum, c) => sum + c.rowsWritten, 0),
    reset: () => {
      cursors = [];
    },
  };
}

async function setupFaux(stub: DurableObjectStub<TockDO>, owner: string): Promise<void> {
  await runInDurableObject(stub, async (instance) => {
    const faux = fauxProvider();
    const models = (instance as unknown as { models: MutableModels }).models;
    models.setProvider(faux.provider);
    faux.setResponses(Array.from({ length: 20 }, (_, i) => fauxAssistantMessage(`reply ${i}`)));
    const model = faux.getModel();
    await instance.updateSettings({ model: `${model.provider}/${model.id}` });
  });
  expect(owner).toBeTruthy();
}

describe("Free Plan write budget", () => {
  it("measures billed rows per warm HTTP turn and while idle", async () => {
    const owner = "writes-http@test";
    const stub = testEnv.TOCK_DO.get(
      testEnv.TOCK_DO.idFromName(owner),
    ) as DurableObjectStub<TockDO>;
    await setupFaux(stub, owner);
    await stub.chatPrompt("first turn warms the conversation");

    const results = await runInDurableObject(stub, async (instance, state) => {
      const meter = installMeter(state.storage);
      const warm: number[] = [];
      for (let i = 0; i < 3; i++) {
        meter.reset();
        const res = await instance.chatPrompt(`warm turn ${i}`);
        expect(res.status).toBe("done");
        warm.push(meter.rows());
      }
      meter.reset();
      await new Promise((r) => setTimeout(r, 1500));
      return { warm, idle: meter.rows() };
    });
    for (const n of results.warm) expect(n).toBeLessThanOrEqual(65);
    expect(results.idle).toBeLessThanOrEqual(2);
  });

  it("measures billed rows per warm WebSocket turn with a live subscriber", async () => {
    const owner = "writes-ws@test";
    const stub = testEnv.TOCK_DO.get(
      testEnv.TOCK_DO.idFromName(owner),
    ) as DurableObjectStub<TockDO>;
    await setupFaux(stub, owner);
    await stub.chatPrompt("first turn warms the conversation");

    const res = await SELF.fetch("https://tock.local/ws", {
      headers: { upgrade: "websocket", "x-tock-owner": owner },
    });
    const ws = res.webSocket!;
    ws.accept();
    const frames: Array<{ id?: string; type: string; event?: string }> = [];
    ws.addEventListener("message", (ev) => {
      frames.push(JSON.parse(String(ev.data)));
    });

    const meterRef = await runInDurableObject(stub, async (_instance, state) => {
      const meter = installMeter(state.storage);
      (globalThis as unknown as { __meter: Meter }).__meter = meter;
      return true;
    });
    expect(meterRef).toBe(true);

    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      await runInDurableObject(stub, async () => {
        (globalThis as unknown as { __meter: Meter }).__meter.reset();
      });
      ws.send(JSON.stringify({ id: `send-${i}`, type: "chat.send", text: `ws warm turn ${i}` }));
      let receipt: { operationId: string; session: string } | undefined;
      for (let t = 0; t < 100 && !receipt; t++) {
        await new Promise((r) => setTimeout(r, 20));
        const ok = frames.find((f) => f.id === `send-${i}` && f.type === "ok") as
          | { data: { operationId: string; session: string } }
          | undefined;
        receipt = ok?.data;
      }
      expect(receipt).toBeDefined();
      counts.push(
        await runInDurableObject(stub, async (instance) => {
          await instance.harness.session(receipt!.session).wait(receipt!.operationId);
          await new Promise((r) => setTimeout(r, 100));
          return (globalThis as unknown as { __meter: Meter }).__meter.rows();
        }),
      );
    }
    const deltas = frames.filter((f) => f.event === "session.delta").length;
    ws.close();
    expect(deltas).toBeGreaterThan(0);
    for (const n of counts) expect(n).toBeLessThanOrEqual(65);
  });
});
