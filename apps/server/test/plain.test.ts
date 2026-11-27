import { describe, expect, it } from "vitest";
import { plainMarkdown } from "../src/core/plain.js";
import { summarizeEntries } from "../src/core/summary.js";

describe("plain titles", () => {
  it("strips headings, emphasis, strikes, code and links", () => {
    expect(plainMarkdown("# Plan **bold** *soft*")).toBe("Plan bold soft");
    expect(plainMarkdown("~~strike only~~")).toBe("strike only");
    expect(plainMarkdown("see [the docs](https://x.dev) and `npm i`")).toBe("see the docs and npm i");
    expect(plainMarkdown("- parent\n  - nested child\n- second")).toBe("parent\nnested child\nsecond");
    expect(plainMarkdown("> quoted __strong__")).toBe("quoted strong");
  });
  it("keeps snake_case, math and escaped characters as words", () => {
    expect(plainMarkdown("Supercali\\_unbroken\\_word")).toBe("Supercali_unbroken_word");
    expect(plainMarkdown("snake_case_name and 2*3*4")).toBe("snake_case_name and 2*3*4");
  });
  it("derives a plain title and preview for the sidebar", () => {
    const summary = summarizeEntries([{ model: [{ role: "user", content: "# Plan **bold** *soft*" }, { role: "assistant", content: "Here's **the** plan" }] }]);
    expect(summary.title).toBe("Plan bold soft");
    expect(summary.preview).toBe("Here's the plan");
  });
});
