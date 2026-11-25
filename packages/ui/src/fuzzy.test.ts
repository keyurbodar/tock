import { expect, test } from "vitest"
import { matches, rank } from "./fuzzy"

const names = ["Model", "Reasoning", "Skills", "Plan mode"]
const by = (name: string) => [name]

test("an empty query keeps every item in order", () => {
  expect(rank(names, by, "  ")).toEqual(names)
})

test("exact beats prefix beats word start beats substring", () => {
  expect(rank(["remodel", "plan model", "models", "model"], by, "model")).toEqual(["model", "models", "plan model", "remodel"])
})

test("a single letter only matches at the start of a word", () => {
  expect(rank(names, by, "m")).toEqual(["Model", "Plan mode"])
})

test("letters at word starts match as a fuzzy hit", () => {
  expect(rank(["Plan mode", "Model"], by, "pm")).toEqual(["Plan mode"])
})

test("secondary fields only count for whole-word hits", () => {
  const items = [{ name: "Reasoning", alias: "effort" }, { name: "Model", alias: "comfort" }]
  expect(rank(items, (item) => [item.name, item.alias], "effort").map((item) => item.name)).toEqual(["Reasoning"])
  expect(rank(items, (item) => [item.name, item.alias], "fort")).toEqual([])
})

test("matches accepts any field", () => {
  expect(matches(["skills", "Skills"], "ski")).toBe(true)
  expect(matches(["skills", "Skills"], "xyz")).toBe(false)
  expect(matches(["skills"], "")).toBe(true)
})
