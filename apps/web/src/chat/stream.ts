import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { tokens } from "@tock/tokens"

interface Progress {
  count: number
  readonly times: number[]
}

/** Live replies change their key when the run commits them, so progress is remembered by the text's opening, for at most limit.stream-kept replies. */
const remembered = new Map<string, Progress>()
function remember(key: string, progress: Progress) {
  remembered.delete(key)
  remembered.set(key, progress)
  for (const oldest of remembered.keys()) {
    if (remembered.size <= tokens.limit["stream-kept"]) break
    remembered.delete(oldest)
  }
}
const keyOf = (text: string) => text.slice(0, tokens.limit["stream-key"])

/**
 * Streamed text, revealed a word at a time. Every word that has arrived already takes its final space; the reveal only
 * fades words in (opacity only), so the text block's height is final the moment text lands.
 * Words are revealed one at a time (TDS motion.stream): words arrive at a steady pace and catch up when the model
 * runs ahead. When the backlog passes stream-burst words (a long reply arriving in bulk), everything but the last few
 * words lands at once and only that tail fades in, so big outputs never crawl. Text that was already finished when it
 * mounted shows at once.
 */
export function createReveal(text: () => string, live: () => boolean) {
  const initial = untrack(text)
  const saved = remembered.get(keyOf(initial))
  const progress: Progress = saved ?? { count: untrack(live) ? 0 : Number.POSITIVE_INFINITY, times: [] }
  const [count, setCount] = createSignal(progress.count)
  // Word ends, recomputed only when the text changes (not on every reveal step).
  const ends = createMemo(() => Array.from(text().matchAll(/\S+/g), (match) => match.index + match[0].length))
  let frame = 0
  let last = 0
  let carry = 0
  const S = tokens.motion.stream

  /**
   * Time-based, adaptive reveal on animation frames. The pace is a floor rate (words a second) or whatever drains the
   * backlog within `drain` ms, whichever is faster, so a slow model reads as steady typing and a fast or huge reply
   * catches up within a fraction of a second instead of crawling. A backlog past `stream-burst` words lands at once
   * except a short tail that still fades. Words are always whole; nothing ever streams character by character.
   */
  const tick = (now: number) => {
    frame = 0
    const dt = last ? Math.min(now - last, 64) : 16
    last = now
    const all = ends()
    const shown = Math.min(progress.count, all.length)
    const backlog = all.length - shown
    if (backlog <= 0) {
      carry = 0
      if (!live()) {
        remembered.delete(keyOf(text()))
        last = 0
        return
      }
      frame = requestAnimationFrame(tick)
      return
    }
    let take: number
    if (backlog > tokens.limit["stream-burst"]) take = backlog - tokens.limit["stream-tail"]
    else {
      const rate = Math.max(S["words-per-second"], (backlog * 1000) / S.drain)
      carry += (rate * dt) / 1000
      take = Math.min(backlog, Math.floor(carry))
      carry -= take
    }
    if (take > 0) {
      const at = performance.now()
      for (let i = Math.max(shown, shown + take - tokens.limit["stream-tail"] * 2); i < shown + take; i++) progress.times[i] = at
      progress.count = shown + take
      remember(keyOf(text()), progress)
      setCount(progress.count)
    }
    frame = requestAnimationFrame(tick)
  }
  const start = () => {
    if (!frame && progress.count !== Number.POSITIVE_INFINITY) frame = requestAnimationFrame(tick)
  }
  start()
  // New text after the reveal caught up and parked: wake it.
  createEffect(ends, () => start())
  onCleanup(() => {
    cancelAnimationFrame(frame)
    if (!untrack(live)) remembered.delete(keyOf(untrack(text)))
  })

  return {
    /** Word i is laid out from the moment it arrives but stays invisible until the reveal reaches it, so layout never changes as words appear. */
    hidden: (i: number) => i >= count(),
    /** How many words are revealed so far. */
    shown: count,
    /** How far into its fade word i is, as a negative delay, so re-rendering never restarts a word. */
    delay: (i: number) => {
      const at = progress.times[i]
      if (at === undefined) return undefined
      const age = performance.now() - at
      return age < tokens.motion.duration.word ? `${-Math.round(age)}ms` : undefined
    },
    revealing: () => count() !== Number.POSITIVE_INFINITY && Math.min(count(), ends().length) < ends().length,
  }
}

export type Reveal = ReturnType<typeof createReveal>
