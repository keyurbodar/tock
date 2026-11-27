import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { enter, exit } from "@tock/ui/motion"
import type { Followup } from "@tock/protocol"

type Set = { readonly key: string; readonly items: readonly Followup[] }

const KEY = "tock.followups.dismissed"
const dismissed = (): ReadonlySet<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}

/**
 * TDS KbSugg: after a reply settles, up to three next steps float just above the composer. Hover shows the prompt,
 * a pick sends it, × waves the row away for good (remembered per turn), and typing hides it until the field is empty.
 */
export function Followups(props: { set: Set | undefined; working: boolean; onPick: (prompt: string) => void }) {
  const [gone, setGone] = createSignal(dismissed())
  const [typed, setTyped] = createSignal(false)
  const [shown, setShown] = createSignal<Set>()
  let row: HTMLDivElement | undefined
  const drafted = () => (document.querySelector(".tds-composer-wrap .ProseMirror")?.textContent ?? "").trim().length > 0
  const onInput = (event: Event) => {
    if ((event.target as HTMLElement | null)?.closest?.(".tds-composer-wrap")) setTyped(drafted())
  }
  createEffect(
    () => [props.working, props.set?.key] as const,
    () => void setTyped(drafted()),
  )
  document.addEventListener("input", onInput, true)
  onCleanup(() => document.removeEventListener("input", onInput, true))
  const wanted = () => (props.set && !props.working && !typed() && !gone().has(props.set.key) ? props.set : undefined)
  let leaving: Promise<unknown> | undefined
  createEffect(wanted, (next) => {
    const now = untrack(shown)
    if (now?.key === next?.key) return
    const chips = [...(row?.querySelectorAll<HTMLElement>(".tds-followup") ?? [])]
    if (!now || chips.length === 0) return void setShown(next)
    const out = Promise.all(chips.map((chip) => exit.followup(chip)?.finished.catch(() => {})))
    leaving = out
    void out.then(() => leaving === out && setShown(untrack(wanted)))
  })
  const mouse = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !row) return
    const over = event.type === "pointerover" ? (event.target as HTMLElement).closest(".tds-followup") : (event.relatedTarget as HTMLElement | null)?.closest?.(".tds-followup")
    row.querySelectorAll("[data-hover]").forEach((el) => el !== over && el !== row && el.removeAttribute("data-hover"))
    over?.setAttribute("data-hover", "")
    row.toggleAttribute("data-hover", event.type === "pointerover" || row.contains(event.relatedTarget as Node | null))
  }
  const dismiss = (key: string) => {
    localStorage.setItem(KEY, JSON.stringify([...dismissed(), key].slice(-200)))
    setGone(dismissed())
  }
  return (
    <Show when={shown()}>
      {(set) => (
        <div ref={(el) => (row = el)} class="tds-followups" onPointerOver={mouse} onPointerOut={mouse} role="group" aria-label="Suggested next steps" data-key={set().key}>
          <For each={set().items} keyed={false}>
            {(item, index) => (
              <button
                ref={(el) => queueMicrotask(() => enter.followup(el, index))}
                type="button"
                class="tds-followup tds-glass"
                aria-describedby={`followup-tip-${index}`}
                onClick={() => props.onPick(item().prompt)}
              >
                <span class="tds-followup-emoji" aria-hidden="true">{item().emoji}</span>
                {item().label}
                <span id={`followup-tip-${index}`} class="tds-followup-tip tds-glass" role="tooltip">
                  {item().prompt}
                </span>
              </button>
            )}
          </For>
          <button type="button" class="tds-followup tds-followup-x tds-glass" aria-label="Dismiss suggestions" onClick={() => dismiss(set().key)}>
            <Icon name="x" size="toast" />
          </button>
        </div>
      )}
    </Show>
  )
}
