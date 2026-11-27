import { createSignal, onCleanup, untrack } from "solid-js"
import { tokens } from "@tock/tokens"

interface Progress {
  count: number
  readonly times: number[]
}

/** Live replies change their key when the run commits them, so progress is remembered by the text's opening. */
const remembered = new Map<string, Progress>()
const keyOf = (text: string) => text.slice(0, tokens.limit["stream-key"])

/**
 * Streamed text, revealed a word at a time (TDS motion.stream): words arrive at a steady pace and catch up when the model
 * runs ahead. When the backlog passes stream-burst words (a long reply arriving in bulk), everything but the last few
 * words lands at once and only that tail fades in, so big outputs never crawl. Text that was already finished when it
 * mounted shows at once.
 */
export function createReveal(text: () => string, live: () => boolean) {
  const initial = untrack(text)
  const saved = remembered.get(keyOf(initial))
  const progress: Progress = saved ?? { count: untrack(live) ? 0 : Number.POSITIVE_INFINITY, times: [] }
  const [count, setCount] = createSignal(progress.count)
  const ends = () => Array.from(text().matchAll(/\S+/g), (match) => match.index + match[0].length)
  let timer: ReturnType<typeof setTimeout> | undefined

  const step = () => {
    timer = undefined
    const all = ends()
    const shown = Math.min(progress.count, all.length)
    const backlog = all.length - shown
    if (backlog <= 0) {
      if (!live()) remembered.delete(keyOf(text()))
      if (live()) timer = setTimeout(step, tokens.motion.duration["word-step"])
      return
    }
    const burst = backlog > tokens.limit["stream-burst"]
    const take = burst ? backlog - tokens.limit["stream-tail"] : Math.max(1, Math.ceil(backlog / tokens.limit["word-catchup"]))
    const at = performance.now()
    for (let i = burst ? shown + take - tokens.limit["stream-tail"] : shown; i < shown + take; i++) progress.times[i] = at
    progress.count = shown + take
    remembered.set(keyOf(text()), progress)
    setCount(progress.count)
    timer = setTimeout(step, tokens.motion.duration["word-step"])
  }
  if (progress.count !== Number.POSITIVE_INFINITY) timer = setTimeout(step, tokens.motion.duration["word-step"])
  onCleanup(() => clearTimeout(timer))

  return {
    /** The revealed prefix, cut at a word end. */
    text: () => {
      const all = ends()
      const shown = Math.min(count(), all.length)
      if (shown >= all.length) return text()
      return shown === 0 ? "" : text().slice(0, all[shown - 1])
    },
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
