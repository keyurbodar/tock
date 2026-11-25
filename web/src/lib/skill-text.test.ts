import { describe, expect, it } from "vitest"
import { composeSkill, parseSkill, skillSlug, SKILL_NAME } from "./skill-text"

describe("skill text", () => {
  it("turns typed names into folder names", () => {
    expect(skillSlug("Release Check!!")).toBe("release-check-")
    expect(skillSlug("--a  b")).toBe("-a-b".replace(/^-/, ""))
    expect(skillSlug("x".repeat(80))).toHaveLength(64)
    expect(SKILL_NAME.test("release-check")).toBe(true)
    expect(SKILL_NAME.test("-release")).toBe(false)
    expect(SKILL_NAME.test("")).toBe(false)
  })

  it("reads name, description and body from frontmatter", () => {
    const parsed = parseSkill('---\nname: release-check\ndescription: "Use: before a release"\nlicense: MIT\n---\n\n# Steps\n')
    expect(parsed.name).toBe("release-check")
    expect(parsed.description).toBe("Use: before a release")
    expect(parsed.body).toBe("# Steps\n")
  })

  it("reads folded and literal descriptions", () => {
    expect(parseSkill("---\ndescription: >-\n  one\n  two\n---\nbody").description).toBe("one two")
    expect(parseSkill("---\ndescription: |\n  one\n  two\n---\nbody").description).toBe("one\ntwo")
  })

  it("treats text without frontmatter as the body", () => {
    expect(parseSkill("just steps")).toEqual({ head: "", entries: [], name: "", description: "", body: "just steps" })
  })

  it("returns the original text when only the body is unchanged", () => {
    const text = "---\nname: a\ndescription: b\nlicense: MIT\n---\n\nbody"
    const parsed = parseSkill(text)
    expect(composeSkill(parsed, parsed.name, parsed.description, parsed.body)).toBe(text)
  })

  it("rewrites only the description line and keeps other keys", () => {
    const parsed = parseSkill("---\nname: a\ndescription: b\nlicense: MIT\n---\n\nbody")
    expect(composeSkill(parsed, "a", "When: releasing", "new body")).toBe(
      '---\nname: a\ndescription: "When: releasing"\nlicense: MIT\n---\n\nnew body',
    )
  })

  it("writes frontmatter for a new skill", () => {
    expect(composeSkill(parseSkill(""), "release-check", "Before a release", "steps")).toBe(
      "---\nname: release-check\ndescription: Before a release\n---\n\nsteps",
    )
  })

  it("round-trips a multi-line description", () => {
    const text = composeSkill(parseSkill(""), "a", "one\ntwo", "body")
    expect(parseSkill(text).description).toBe("one\ntwo")
  })
})
