import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { Icon } from "@tock/ui/icon"
import { TockIcon } from "@tock/ui/tock-icon"
import { followupIcon } from "./followup-icons"
import { animate, dur, ease, swapFollowup } from "@tock/ui/motion"
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

const look = tokens.material.followup
const CHIPS = ".tds-followup:not(.tds-followup-x)"

/** Chips rise into place one after another; the glyph follows its label a beat later, as in the reference. */
function enterChips(row: HTMLElement) {
  row.querySelectorAll<HTMLElement>(CHIPS).forEach((chip, i) => {
    const delay = i * dur["followup-stagger"]
    animate(
      chip,
      [
        { opacity: 0, translate: `0 ${look.rise}`, scale: look["enter-scale"] },
        { opacity: 1, translate: "0 0", scale: 1 },
      ],
      { duration: dur["followup-enter"], delay, easing: ease.out, fill: "backwards" },
    )
    animate(chip.querySelector(".tds-followup-emoji"), [{ opacity: 0 }, { opacity: 1 }], {
      duration: dur["followup-emoji"],
      delay: delay + dur["followup-emoji"],
      easing: ease.out,
      fill: "backwards",
    })
  })
}

/** Chips drop and soften away together; a picked chip holds a beat so the eye follows it into the composer. */
function leaveChips(row: HTMLElement, picked: number | undefined) {
  const gone = { opacity: 0, translate: `0 ${look.rise}`, scale: look["enter-scale"] }
  const runs = [...row.querySelectorAll<HTMLElement>(".tds-followup")].map((el, i) =>
    animate(el, el.classList.contains("tds-followup-x") ? [{ opacity: 0 }] : [{ opacity: 1, translate: "0 0", scale: 1 }, gone], {
      duration: dur["followup-exit"],
      delay: i === picked ? dur["followup-pick"] : 0,
      easing: ease.std,
      fill: "forwards",
    }),
  )
  return Promise.all(runs.map((run) => run.finished))
}

/**
 * Follow-up suggestions: after a reply settles up to three chips sit just above the composer. Hover lifts a chip and
 * parts its glyph; resting on it shows the full prompt (one grouped tooltip, so moving along the row doesn't re-wait).
 * A pick puts the prompt in the composer, × (on row hover) waves the row away for that turn, and typing hides it.
 * A new set morphs the chips in place; a row that grows, or one with nothing before it, rises in.
 */
export function Followups(props: { chat: string; set: Set | undefined; working: boolean; onPick: (prompt: string) => void }) {
  const [gone, setGone] = createSignal(dismissed())
  const [typed, setTyped] = createSignal((document.querySelector(".tds-composer-wrap .ProseMirror")?.textContent ?? "").trim().length > 0)
  const [key, setKey] = createSignal<string>()
  const [chips, setChips] = createSignal<readonly Chip[]>([])
  /** "swap" while a set morphs in, "rest" once the chips show their final labels: the end signal tests wait on. */
  const [phase, setPhase] = createSignal<"swap" | "rest">("rest")
  let row: HTMLDivElement | undefined
  /** The chip just picked, so the leave can let it go last. */
  let picked: number | undefined
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
    row?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
  }
  let run = 0
  onCleanup(() => cancelAnimationFrame(frame))
  /** A reply has settled once its words have finished revealing, so the chips never come up under a sentence still being written. */
  const afterReveal = (show: () => void) => {
    cancelAnimationFrame(frame)
    const tick = () => (document.querySelector(".tds-transcript :is(.tds-word-wait, .tds-word)") ? (frame = requestAnimationFrame(tick)) : show())
    tick()
  }
  const widths = () => [...(row?.querySelectorAll<HTMLElement>(CHIPS) ?? [])].map((el) => el.getBoundingClientRect().width)
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
      const now = [...row.querySelectorAll<HTMLElement>(CHIPS)]
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
    const id = ++run
    const fresh = !untrack(key) || leaving
    stopLeave()
    picked = undefined
    setPhase("rest")
    setKey(next.key)
    setChips(next.items.map((cur) => ({ cur })))
    queueMicrotask(() => id === run && fresh && row && enterChips(row))
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
      if (!row || !now || leaving) return
      const id = ++leaveRun
      leaving = true
      void leaveChips(row, picked).then(
        () => {
          if (id !== leaveRun || !leaving) return
          run++
          leaving = false
          picked = undefined
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
      const mounted = !!untrack(key) && !!row && row.isConnected && !leaving
      const last = handoff && performance.now() - handoff.at < tokens.motion.duration["followup-handoff"] ? handoff : undefined
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
  /** Hover comes from mouse pointer events only, so a tap never latches the lifted look. */
  const mouse = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !row) return
    const over = event.type === "pointerover" ? (event.target as HTMLElement).closest(".tds-followup") : (event.relatedTarget as HTMLElement | null)?.closest?.(".tds-followup")
    row.querySelectorAll("[data-hover]").forEach((el) => el !== over && el !== row && el.removeAttribute("data-hover"))
    over?.setAttribute("data-hover", "")
    row.toggleAttribute("data-hover", event.type === "pointerover" || row.contains(event.relatedTarget as Node | null))
  }
  createEffect(
    () => !!key(),
    (shown) => {
      const host = row?.parentElement ?? document.querySelector<HTMLElement>("[data-pane=thread]")
      host?.style.setProperty("--followup-reserve", shown ? `${tokens.size["followup-chip"] + tokens.space[12]}px` : "0px")
    },
  )
  onCleanup(() => document.querySelector<HTMLElement>("[data-pane=thread]")?.style.setProperty("--followup-reserve", "0px"))
  return (
    <Show when={key()}>
      {(current) => (
        <div ref={(el) => (row = el)} class="tds-followups" onPointerOver={mouse} onPointerOut={mouse} role="group" aria-label="Suggested next steps" data-key={current()} data-phase={phase()}>
          <For each={chips()} keyed={false}>
            {(chip, index) => (
              <Tooltip delay={dur["followup-tip-delay"]}>
                <TooltipTrigger
                  type="button"
                  class="tds-followup tds-glass"
                  onClick={() => {
                    picked = index
                    props.onPick(chip().cur.prompt)
                  }}
                >
                  <span class="tds-followup-emoji" aria-hidden="true">
                    <Show when={chip().prev}>{(prev) => <span data-prev=""><TockIcon name={followupIcon(prev())} variant="glass" size={tokens.size["followup-emoji-box"]} /></span>}</Show>
                    <span data-cur="">
                      <TockIcon name={followupIcon(chip().cur)} variant="glass" size={tokens.size["followup-emoji-box"]} />
                    </span>
                  </span>
                  <span class="tds-followup-label">
                    <Show when={chip().prev}>{(prev) => <span data-prev="" aria-hidden="true">{prev().label}</span>}</Show>
                    <span data-cur="">{chip().cur.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent class="tds-followup-tip" data-material="solid" side="top" sideOffset={tokens.size["followup-tip-gap"]}>
                  {chip().cur.prompt}
                </TooltipContent>
              </Tooltip>
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
