import { createEffect, onCleanup } from "solid-js"
import { TextMorph as Engine } from "torph"
import { tokens } from "@tock/tokens"

export function TextMorph(props: { value: string | number; class?: string; numbers?: boolean }) {
  let el!: HTMLSpanElement
  let engine: Engine | undefined
  createEffect(
    () => props.value,
    (value) => {
      engine ??= new Engine({
        element: el,
        duration: tokens.motion.duration.swap,
        ease: tokens.motion.curve.out,
        numbers: props.numbers ?? true,
        locale: "en",
      })
      engine.update(value)
    },
  )
  onCleanup(() => engine?.destroy())
  return <span ref={el} class={`tds-morph-text ${props.class ?? ""}`} />
}
