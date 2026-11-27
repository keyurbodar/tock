import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { TockDO } from "../src/do.js";
import type { Env } from "../src/types.js";
import { ThinkingSpans } from "../src/core/thinking.js";

const testEnv = env as unknown as Env;

describe("thinking spans", () => {
  it("times a thinking block from its first streamed delta to the next block, once", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("thinking@test")) as DurableObjectStub<TockDO>;
    await runInDurableObject(stub, async (_instance, state) => {
      let clock = 1_000;
      const spans = new ThinkingSpans(state.storage.sql, () => clock);
      const msg = (...types: string[]) => ({ timestamp: 42, content: types.map((type) => ({ type })) });
      expect(spans.observe("s", msg("thinking"))).toEqual([]);
      clock = 1_800;
      expect(spans.observe("s", msg("thinking"))).toEqual([]);
      clock = 3_400;
      expect(spans.observe("s", msg("thinking", "toolCall"))).toEqual([{ key: "42:0", ms: 2_400 }]);
      clock = 5_000;
      expect(spans.observe("s", msg("thinking", "toolCall"))).toEqual([]);
      expect(spans.observe("s", undefined)).toEqual([]);
      expect(spans.list("s")).toEqual({ "42:0": 2_400 });

      const again = new ThinkingSpans(state.storage.sql, () => clock);
      expect(again.observe("s", msg("thinking"))).toEqual([]);
      expect(again.list("s")).toEqual({ "42:0": 2_400 });
    });
  });

  it("ends an open thought when the generation stops streaming", async () => {
    const stub = testEnv.TOCK_DO.get(testEnv.TOCK_DO.idFromName("thinking-stop@test")) as DurableObjectStub<TockDO>;
    await runInDurableObject(stub, async (_instance, state) => {
      let clock = 10;
      const spans = new ThinkingSpans(state.storage.sql, () => clock);
      spans.observe("s", { timestamp: 7, content: [{ type: "text" }, { type: "thinking" }] });
      clock = 510;
      expect(spans.observe("s", undefined)).toEqual([{ key: "7:1", ms: 500 }]);
    });
  });
});
