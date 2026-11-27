import { describe, expect, it } from "bun:test"
import { inertiaTail, lockAxis, swipeDecision, swipeThresholds } from "./swipe"

const t = swipeThresholds(296)

describe("swipe intent", () => {
  it("waits out the dead zone, then locks one axis", () => {
    expect(lockAxis(6, 2)).toBeUndefined()
    expect(lockAxis(12, 3)).toBe("x")
    expect(lockAxis(9, 9)).toBe("y")
    expect(lockAxis(14, 11)).toBe("y")
  })
  it("short drag rests open, never acts", () => expect(swipeDecision(-70, 0, t)).toEqual({ kind: "open" }))
  it("tiny drag closes", () => expect(swipeDecision(-30, 0, t)).toEqual({ kind: "close" }))
  it("medium drag commits the near action", () => expect(swipeDecision(-(t.arm + 5), 0, t)).toEqual({ kind: "commit", stage: 1 }))
  it("long drag commits the far action", () => expect(swipeDecision(-(t.far + 5), 0, t)).toEqual({ kind: "commit", stage: 2 }))
  it("a fast flick commits only the near action", () => {
    expect(swipeDecision(-60, -1.5, t)).toEqual({ kind: "commit", stage: 1 })
    expect(swipeDecision(-(t.arm + 10), -3, t)).toEqual({ kind: "commit", stage: 1 })
  })
  it("flicking back cancels even when armed", () => expect(swipeDecision(-(t.far + 5), 1.5, t)).toEqual({ kind: "close" }))
  it("wheel releases carry no velocity, so momentum alone never commits", () => expect(swipeDecision(-90, 0, t)).toEqual({ kind: "open" }))
  it("thresholds are ordered on narrow rows too", () => {
    for (const w of [200, 240, 296, 360]) {
      const s = swipeThresholds(w)
      expect(s.open < s.arm && s.arm < s.far && s.far < w).toBe(true)
    }
  })
})

describe("inertia tail", () => {
  it("finds the decaying run and reports where the finger let go", () => {
    const tail = inertiaTail()
    let x = 0
    let found: number | undefined
    for (const d of [4, 9, 14, 16, 15, 16, 14, 12, 10, 8, 6]) {
      found = tail.push(d, x) ?? found
      x -= d
      if (found !== undefined) break
    }
    expect(found).toBe(-88)
  })
  it("a steady hand is not a tail", () => {
    const tail = inertiaTail()
    expect([10, 12, 11, 12, 10, 11, 12].map((d) => tail.push(d, 0)).every((v) => v === undefined)).toBe(true)
  })
})
