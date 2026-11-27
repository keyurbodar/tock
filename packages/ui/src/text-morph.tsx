import { createEffect, onCleanup } from "solid-js"
import { TextMorph as Engine } from "torph"
import { tokens } from "@tock/tokens"
import { animate } from "./motion/core"

/**
 * roll   digits roll like an odometer: only counts that genuinely tick (badges, unread counts)
 * morph  torph letter morph with digits treated as letters: titles, statuses, labels
 * calm   old cross-fades to new with a slight blur and no movement; bursts swap instantly
 * swap   instant tabular swap: live timers, progress and anything that changes many times a second
 */
export type TextMode = "roll" | "morph" | "calm" | "swap"

const blur = (v: string) => `blur(${v})`

export function TextMorph(props: { value: string | number; mode: TextMode; class?: string }) {
  let el!: HTMLSpanElement
  let now!: HTMLSpanElement
  let engine: Engine | undefined
  let changed = -Infinity
  let runs: Animation[] = []
  const mode = props.mode
  const { duration, curve, blur: b } = tokens.motion
  const calm = (value: string) => {
    const was = now.textContent ?? ""
    now.textContent = value
    if (!was || was === value) return
    const at = performance.now()
    const burst = at - changed < duration.calm
    changed = at
    runs.forEach((a) => a.cancel())
    runs = []
    if (burst) return el.removeAttribute("data-was")
    el.dataset.was = was
    const out = animate(el, [{ opacity: 1, filter: blur("0px") }, { opacity: 0, filter: blur(b.calm) }], { duration: duration.calm, pseudoElement: "::after" })
    out.finished.then(
      () => el.removeAttribute("data-was"),
      () => {},
    )
    runs = [out, animate(now, [{ opacity: 0, filter: blur(b.calm) }, { opacity: 1, filter: blur("0px") }], duration.calm)]
  }
  createEffect(
    () => String(props.value),
    (value) => {
      if (mode === "calm") return calm(value)
      if (mode === "swap" || (!engine && !el.textContent)) {
        el.textContent = value
        return
      }
      engine ??= new Engine({ element: el, duration: duration.swap, ease: curve.out, numbers: mode === "roll", locale: "en" })
      engine.update(value)
    },
  )
  onCleanup(() => engine?.destroy())
  return (
    <span ref={el} class={`tds-morph-text ${props.class ?? ""}`} data-mode={mode}>
      {mode === "calm" && <span ref={(e) => (now = e)} />}
    </span>
  )
}
