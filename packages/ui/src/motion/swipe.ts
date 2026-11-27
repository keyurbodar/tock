import { tokens } from "@tock/tokens"

const g = tokens.motion.gesture

/** Which way a row has been pulled: leading reveals the left actions (row moves right), trailing the right ones. */
export type SwipeSide = "leading" | "trailing"
/** 0: nothing armed, 1: the near action (short swipe), 2: the far action (long swipe). */
export type SwipeStage = 0 | 1 | 2
export type SwipeDecision = { kind: "close" } | { kind: "open" } | { kind: "commit"; stage: 1 | 2 }

export interface SwipeThresholds {
  /** Release past this (and not flicking back) rests the row open on both buttons. */
  readonly open: number
  /** The near action arms here. */
  readonly arm: number
  /** The far action arms here; it needs real distance, never velocity alone. */
  readonly far: number
  /** Where the row rests when open. */
  readonly rest: number
  /** Furthest the row goes before the rubber band. */
  readonly limit: number
}

/** Thresholds for a row of this width: the far action sits at 70% of the row but never closer than arm + 70. */
export function swipeThresholds(width: number): SwipeThresholds {
  const far = Math.min(Math.max(g["swipe-arm-far"], width * g["swipe-arm-far-ratio"]), width - g["swipe-far-margin"])
  return { open: g["swipe-open"], arm: Math.min(g["swipe-arm"], far - g["swipe-far-margin"]), far, rest: g["swipe-rest"], limit: far + g["swipe-far-margin"] / 2 }
}

/** Axis lock: undecided inside the dead zone, then x only for a clearly sideways move, y otherwise. Decided once per gesture. */
export function lockAxis(dx: number, dy: number): "x" | "y" | undefined {
  if (Math.hypot(dx, dy) < g["swipe-dead"]) return undefined
  return Math.abs(dx) > Math.abs(dy) * g["swipe-ratio"] ? "x" : "y"
}

/** The visible offset for a finger offset: 1:1 up to the far threshold, then a rubber band. */
export function swipeOffset(dx: number, t: SwipeThresholds) {
  const abs = Math.abs(dx)
  return abs <= t.limit ? dx : Math.sign(dx) * (t.limit + (abs - t.limit) * g.rubber)
}

export const swipeStage = (x: number, t: SwipeThresholds): SwipeStage => (Math.abs(x) >= t.far ? 2 : Math.abs(x) >= t.arm ? 1 : 0)

/**
 * What a release does. Distance arms each action and shows it before you let go; velocity only helps the near action
 * (a quick flick past the open point commits it) and a flick back towards rest cancels. Wheel releases pass velocity 0,
 * so trackpad momentum never commits on its own.
 */
export function swipeDecision(x: number, velocity: number, t: SwipeThresholds): SwipeDecision {
  const toward = velocity * Math.sign(x)
  if (toward < -g["swipe-flick"]) return { kind: "close" }
  const stage = swipeStage(x, t)
  if (stage) return { kind: "commit", stage }
  const projected = Math.abs(x) + toward * g.project
  if (Math.abs(x) >= t.open && toward > g["swipe-flick"] && projected >= t.arm) return { kind: "commit", stage: 1 }
  return Math.abs(x) >= t.open ? { kind: "open" } : { kind: "close" }
}

/** Velocity in px/ms over the last few samples, so one jittery event can't fake a flick. */
export function velocityTracker() {
  let samples: { x: number; t: number }[] = []
  return {
    reset: () => void (samples = []),
    push(x: number, t: number) {
      samples.push({ x, t })
      samples = samples.filter((s) => t - s.t <= g["swipe-window"])
    },
    get(): number {
      const first = samples[0]
      const last = samples[samples.length - 1]
      return first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
    },
  }
}

/**
 * Spots the trackpad inertia tail: after the fingers lift, the OS keeps sending wheel events whose size decays smoothly.
 * A run of tail-run events each smaller than the one before (by tail-decay), and below tail-peak of the gesture's peak,
 * is the tail. Pass each event's delta with the offset before it is applied; it returns the offset where the run began,
 * which is where the finger actually let go.
 */
export function inertiaTail() {
  let peak = 0
  let prev = 0
  let run = 0
  let startedAt = 0
  return {
    push(delta: number, offset: number): number | undefined {
      const size = Math.abs(delta)
      peak = Math.max(peak, size)
      if (size > 0 && size <= prev * g["tail-decay"] && size <= peak * g["tail-peak"]) {
        if (run === 0) startedAt = offset
        run++
      } else run = 0
      prev = size
      return run >= g["tail-run"] ? startedAt : undefined
    },
  }
}
