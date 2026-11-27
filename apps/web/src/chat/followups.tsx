import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { exit, swapFollowup } from "@tock/ui/motion"
import type { Followup } from "@tock/protocol"
import { tokens } from "@tock/tokens"

type Set = { readonly key: string; readonly items: readonly Followup[] }
type Chip = { readonly cur: Followup; readonly prev?: Followup }

/** The row a chat switch just unmounted, so the next chat's row can morph out of it instead of popping in. */
let handoff: { readonly items: readonly Followup[]; readonly widths: readonly number[]; readonly at: number } | undefined

const KEY = "tock.followups.dismissed"
const dismissed = (): ReadonlySet<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}

/**
 * Follow-up suggestions, built 1:1 from Keyur's reference (fb-1650): after a reply settles up to three chips sit just
 * above the composer. Hover shows the full prompt, a pick puts it in the composer, × (on row hover) waves the row away
 * for that turn, and typing hides it. A new set morphs the chips in place; a row that grows, or one with nothing
 * before it, simply appears.
 */
export function Followups(props: { chat: string; set: Set | undefined; working: boolean; onPick: (prompt: string) => void }) {
  const [gone, setGone] = createSignal(dismissed())
  const [typed, setTyped] = createSignal((document.querySelector(".tds-composer-wrap .ProseMirror")?.textContent ?? "").trim().length > 0)
  const [key, setKey] = createSignal<string>()
  const [chips, setChips] = createSignal<readonly Chip[]>([])
  /** "swap" while a set morphs in, "rest" once the chips show their final labels: the end signal tests wait on. */
  const [phase, setPhase] = createSignal<"swap" | "rest">("rest")
  let row: HTMLDivElement | undefined
  /** The composer says when its draft turns empty or not (typing, a restored draft, a send, a pick), so the row hides while there's a draft. */
  const onDraft = (event: Event) => setTyped(!(event as CustomEvent<boolean>).detail)
  addEventListener("tds-composer-empty", onDraft)
  onCleanup(() => removeEventListener("tds-composer-empty", onDraft))
  const wanted = () => (props.set && !props.working && !typed() && !gone().has(props.set.key) ? props.set : undefined)
  let frame = 0
  let leaving = false
  let leaveRun = 0
  /** A leave the same or a newer set interrupts: drop its fade so the row stays visible. */
  const stopLeave = () => {
    if (!leaving) return
    leaving = false
    leaveRun++
    row?.getAnimations().forEach((animation) => animation.cancel())
  }
  let run = 0
  onCleanup(() => cancelAnimationFrame(frame))
  /** A reply has settled once its words have finished revealing, so the chips never come up under a sentence still being written. */
  const afterReveal = (show: () => void) => {
    cancelAnimationFrame(frame)
    const tick = () => (document.querySelector(".tds-transcript :is(.tds-word-wait, .tds-word)") ? (frame = requestAnimationFrame(tick)) : show())
    tick()
  }
  const widths = () => [...(row?.querySelectorAll<HTMLElement>(".tds-followup:not(.tds-followup-x)") ?? [])].map((el) => el.getBoundingClientRect().width)
  let measured: readonly number[] = []
  const remember = () => requestAnimationFrame(() => (measured = widths()))
  onCleanup(() => {
    if (untrack(key) && measured.length) handoff = { items: untrack(chips).map((chip) => chip.cur), widths: measured, at: performance.now() }
  })
  const morph = (next: Set, before: readonly Followup[], from: readonly number[]) => {
    const id = ++run
    setKey(next.key)
    setPhase("swap")
    setChips(next.items.map((cur, i) => ({ cur, prev: before[i] })))
    queueMicrotask(() => {
      if (id !== run || !row) return void (id === run && setPhase("rest"))
      const now = [...row.querySelectorAll<HTMLElement>(".tds-followup:not(.tds-followup-x)")]
      row.setAttribute("data-measure", "")
      const to = now.map((el) => el.getBoundingClientRect().width)
      row.removeAttribute("data-measure")
      void Promise.all(
        now.map((el, i) =>
          swapFollowup(el, from[i] ?? to[i]!, to[i]!, {
            out: [...el.querySelectorAll(".tds-followup-label > [data-prev]")],
            in: [...el.querySelectorAll(".tds-followup-label > [data-cur]")],
            emojiOut: [...el.querySelectorAll(".tds-followup-emoji > [data-prev]")],
            emojiIn: [...el.querySelectorAll(".tds-followup-emoji > [data-cur]")],
          }),
        ),
      ).then(() => {
        if (id !== run) return
        setChips(next.items.map((cur) => ({ cur })))
        queueMicrotask(() => {
          now.forEach((el) => el.getAnimations().forEach((animation) => animation.cancel()))
          setPhase("rest")
        })
        remember()
      })
    })
  }
  const show = (next: Set) => {
    run++
    stopLeave()
    setPhase("rest")
    setKey(next.key)
    setChips(next.items.map((cur) => ({ cur })))
    remember()
  }
  let chat = untrack(() => props.chat)
  createEffect(wanted, (next) => {
    if (untrack(() => props.chat) !== chat) {
      chat = untrack(() => props.chat)
      if (untrack(key) && row) handoff = { items: untrack(chips).map((chip) => chip.cur), widths: widths(), at: performance.now() }
      run++
      stopLeave()
      cancelAnimationFrame(frame)
      setKey(undefined)
      setChips([])
      setPhase("rest")
    }
    const now = untrack(key)
    if (now === next?.key) {
      cancelAnimationFrame(frame)
      if (next) stopLeave()
      return
    }
    if (!next) {
      cancelAnimationFrame(frame)
      if (!row || !now) return
      const id = ++leaveRun
      leaving = true
      void exit.followup(row)?.finished.then(
        () => {
          if (id !== leaveRun || !leaving) return
          run++
          leaving = false
          setKey(undefined)
          setChips([])
          setPhase("rest")
        },
        () => {},
      )
      return
    }
    afterReveal(() => {
      const target = untrack(wanted)
      if (!target) return
      const mounted = !!untrack(key) && !!row && row.isConnected && row.getAnimations().length === 0
      const last = handoff && performance.now() - handoff.at < tokens.motion.duration.panel * 3 ? handoff : undefined
      handoff = undefined
      if (mounted && target.items.length <= untrack(chips).length) morph(target, untrack(chips).map((chip) => chip.cur), widths())
      else if (!mounted && last && target.items.length <= last.items.length) morph(target, last.items, last.widths)
      else show(target)
    })
  })
  const dismiss = (current: string) => {
    localStorage.setItem(KEY, JSON.stringify([...dismissed(), current].slice(-200)))
    setGone(dismissed())
  }
  const mouse = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !row) return
    const over = event.type === "pointerover" ? (event.target as HTMLElement).closest(".tds-followup") : (event.relatedTarget as HTMLElement | null)?.closest?.(".tds-followup")
    row.querySelectorAll("[data-hover]").forEach((el) => el !== over && el !== row && el.removeAttribute("data-hover"))
    over?.setAttribute("data-hover", "")
    row.toggleAttribute("data-hover", event.type === "pointerover" || row.contains(event.relatedTarget as Node | null))
  }
  return (
    <Show when={key()}>
      {(current) => (
        <div ref={(el) => (row = el)} class="tds-followups" onPointerOver={mouse} onPointerOut={mouse} role="group" aria-label="Suggested next steps" data-key={current()} data-phase={phase()}>
          <For each={chips()} keyed={false}>
            {(chip, index) => (
              <button
                type="button"
                class="tds-followup tds-glass"
                aria-describedby={`followup-tip-${index}`}
                onClick={() => props.onPick(chip().cur.prompt)}
              >
                <span class="tds-followup-emoji" aria-hidden="true">
                  <Show when={chip().prev}>{(prev) => <span data-prev="">{prev().emoji}</span>}</Show>
                  <span data-cur="">{chip().cur.emoji}</span>
                </span>
                <span class="tds-followup-label">
                  <Show when={chip().prev}>{(prev) => <span data-prev="" aria-hidden="true">{prev().label}</span>}</Show>
                  <span data-cur="">{chip().cur.label}</span>
                </span>
                <span id={`followup-tip-${index}`} class="tds-followup-tip tds-glass" role="tooltip">
                  {chip().cur.prompt}
                </span>
              </button>
            )}
          </For>
          <button type="button" class="tds-followup tds-followup-x tds-glass" aria-label="Dismiss suggestions" onClick={() => dismiss(current())}>
            <Icon name="x" size="chip" />
          </button>
        </div>
      )}
    </Show>
  )
}
