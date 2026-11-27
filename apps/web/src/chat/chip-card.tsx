import { createSignal, Match, onCleanup, onSettled, Show, Switch, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { animate } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { app, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { extension } from "./attachments"
import { fileChip, type CardKind } from "./chip"
import { brokenFavicon, fadeFavicon, LinkCardBody, webHost } from "./link"

interface Open {
  readonly anchor: HTMLElement
  readonly kind: CardKind
  readonly id: string
  readonly label: string
}

interface SkillInfo {
  readonly name: string
  readonly description: string
}

const [skills, setSkills] = createSignal<readonly SkillInfo[] | undefined>(undefined)
let skillsLoading = false

const loadSkills = () => {
  skillsLoading = true
  void fetch("/api/skills")
    .then((response) => (response.ok ? (response.json() as Promise<{ skills: SkillInfo[] }>) : { skills: [] }))
    .catch(() => ({ skills: [] }))
    .then((body) => setSkills(() => body.skills.map((skill) => ({ name: skill.name, description: skill.description }))))
    .finally(() => (skillsLoading = false))
}

/** Installed skills, fetched on first use (the @ menu and skill cards share it). */
export function skillList(): readonly SkillInfo[] {
  if (skills() === undefined && !skillsLoading) loadSkills()
  return skills() ?? []
}

/** A chip names a skill the list has not seen (installed since it loaded): fetch the list again once. */
const refreshFor = new Set<string>()
function refreshSkillsFor(name: string) {
  if (refreshFor.has(name) || skillsLoading) return
  refreshFor.add(name)
  loadSkills()
}

const m = tokens.motion

/**
 * One hover card for every chip, as T3Code's SharedTooltipProvider: triggers are found by delegation (`[data-card]`), so a
 * long transcript mounts no card per chip. Timing is Base UI's tooltip: open after a rest (chip-card.open), reopen at
 * once right after another closed (chip-card.reopen), a short grace to travel into the card (chip-card.grace), keyboard
 * focus opens at once, a press or a scroll dismisses. The card scales from .98 with a fade at its trigger-side origin.
 */
export function ChipCards() {
  const [open, setOpen] = createSignal<Open | null>(null)
  let card: HTMLDivElement | undefined
  let current: Open | null = null
  let hovered: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: HTMLElement | null = null
  let lastClosedAt = -Infinity

  const read = (anchor: HTMLElement): Open | null => {
    const kind = anchor.dataset.card as CardKind | undefined
    if (!kind) return null
    return { anchor, kind, id: anchor.dataset.cardId ?? anchor.dataset.id ?? "", label: anchor.dataset.cardLabel ?? anchor.textContent?.trim() ?? "" }
  }
  const commit = (next: Open | null) => {
    if (!next && current) lastClosedAt = performance.now()
    current = next
    if (next) return void setOpen(next)
    const leaving = card
    if (!leaving) return void setOpen(null)
    animate(leaving, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: String(m.enter.card.scale) }], { duration: m.exit.card, fill: "forwards" })?.finished.then(
      () => current === null && setOpen(null),
      () => undefined,
    )
  }
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
    pending = null
  }
  const show = (anchor: HTMLElement, immediate: boolean) => {
    clear()
    const next = read(anchor)
    if (!next) return
    if (immediate || current !== null || performance.now() - lastClosedAt < m["chip-card"].reopen) return commit(next)
    pending = anchor
    timer = setTimeout(() => {
      pending = null
      commit(next)
    }, m["chip-card"].open)
  }
  const hide = (anchor: HTMLElement) => {
    if (pending === anchor) return clear()
    if (current?.anchor !== anchor) return
    clear()
    timer = setTimeout(() => commit(null), m["chip-card"].grace)
  }
  const dismiss = () => {
    clear()
    if (!current) return
    commit(null)
    lastClosedAt = -Infinity
  }

  const trigger = (target: EventTarget | null) => (target instanceof Element ? (target.closest("[data-card]") as HTMLElement | null) : null)
  const over = (event: PointerEvent) => {
    if (event.pointerType === "touch") return
    if (card?.contains(event.target as Node)) return clear()
    const anchor = trigger(event.target)
    if (anchor === hovered) return
    if (hovered) hide(hovered)
    hovered = anchor
    if (anchor) show(anchor, false)
  }
  const out = (event: PointerEvent) => {
    const into = event.relatedTarget as Node | null
    if (into && (hovered?.contains(into) || card?.contains(into))) return
    if (card?.contains(event.target as Node) && current) return hide(current.anchor)
    if (!hovered) return
    hide(hovered)
    hovered = null
  }
  const focus = (event: FocusEvent) => {
    const anchor = trigger(event.target)
    if (anchor?.matches(":focus-visible")) show(anchor, true)
  }
  const blur = (event: FocusEvent) => {
    const anchor = trigger(event.target)
    if (anchor && current?.anchor === anchor) hide(anchor)
  }
  const press = (event: PointerEvent) => {
    if (!card?.contains(event.target as Node)) dismiss()
  }
  const scroll = (event: Event) => {
    if (card?.contains(event.target as Node)) return
    if (current?.anchor.matches(":focus-visible")) return
    dismiss()
  }
  const key = (event: KeyboardEvent) => event.key === "Escape" && current && dismiss()
  const favicon = (event: Event) => {
    const img = event.target
    if (!(img instanceof HTMLImageElement) || !img.closest(".tds-input .tds-chip-slot")) return
    if (event.type === "load") fadeFavicon(img)
    else brokenFavicon(img, img.dataset.host ?? "")
  }
  const listeners: [string, EventListener, boolean][] = [
    ["pointerover", over as EventListener, false],
    ["pointerout", out as EventListener, false],
    ["focusin", focus as EventListener, false],
    ["focusout", blur as EventListener, false],
    ["pointerdown", press as EventListener, true],
    ["scroll", scroll, true],
    ["keydown", key as EventListener, false],
    ["load", favicon, true],
    ["error", favicon, true],
  ]
  onSettled(() => {
    for (const [type, fn, capture] of listeners) document.addEventListener(type, fn, capture)
  })
  onCleanup(() => {
    clear()
    for (const [type, fn, capture] of listeners) document.removeEventListener(type, fn, capture)
  })

  /** Top of the trigger, centred on it, nudged inside the viewport; below it when there's no room above. */
  const place = (el: HTMLDivElement, anchor: HTMLElement) => {
    const a = anchor.getBoundingClientRect()
    const edge = tokens.size["card-edge"]
    const offset = tokens.size["card-offset"]
    const w = el.offsetWidth
    const h = el.offsetHeight
    const above = a.top - offset - h >= edge
    const left = Math.min(Math.max(edge, a.left + a.width / 2 - w / 2), innerWidth - edge - w)
    const top = above ? a.top - offset - h : a.bottom + offset
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.transformOrigin = `${a.left + a.width / 2 - left}px ${above ? h : 0}px`
  }
  const mount = (el: HTMLDivElement) => {
    card = el
    queueMicrotask(() => {
      const now = current
      if (!now || card !== el) return
      place(el, now.anchor)
      animate(el, [{ opacity: 0, scale: String(m.enter.card.scale) }, { opacity: 1, scale: "1" }], { duration: m.enter.card.duration, fill: "forwards" })
    })
  }

  return (
    <Show when={open()} keyed>
      {(value) => (
        <div
          ref={mount}
          class={`tds-chip-card tds-over tds-${value.kind === "thread" ? "thread" : value.kind}-card`}
          role="tooltip"
          data-kind={value.kind}
        >
          <Switch>
            <Match when={value.kind === "link"}>
              <LinkCardBody href={value.id} host={webHost(value.id) ?? ""} />
            </Match>
            <Match when={value.kind === "thread"}>
              <ThreadCardBody id={value.id} label={value.label} />
            </Match>
            <Match when={value.kind === "file"}>
              <FileCardBody name={value.label} />
            </Match>
            <Match when={value.kind === "skill"}>
              <SkillCardBody name={value.id} />
            </Match>
          </Switch>
        </div>
      )}
    </Show>
  )
}

function ThreadCardBody(props: { id: string; label: string }) {
  const session = () => app.sessions.find((entry) => entry.id === props.id)
  const glyph = () => glyphFor(props.id)
  return (
    <>
      <span class="tds-chip-card-head">
        <span class={`tds-row-icon ${glyph().hue}`}>
          <svg class="tds-icon tds-chip-icon" aria-hidden="true">
            <use href={`#i-${glyph().icon}`} />
          </svg>
        </span>
        <b class="tds-chip-card-title">{session() ? titleOf(session()) : props.label}</b>
      </span>
      <Show when={session()} fallback={<span class="tds-chip-card-line">This chat was deleted or isn’t on this device yet.</span>}>
        {(current) => (
          <>
            <Show when={current().preview}>
              <span class="tds-thread-card-preview">{current().preview}</span>
            </Show>
            <span class="tds-chip-card-line">
              {current().busy ? "Working" : `${current().messageCount} messages`}
              <Show when={current().updatedAt}> · {shortTime(current().updatedAt)}</Show>
            </span>
          </>
        )}
      </Show>
    </>
  )
}

function FileCardBody(props: { name: string }) {
  const meta = () => fileChip(props.name)
  return (
    <>
      <span class="tds-chip-card-head" style={{ "--tds-chip-accent": `var(--tds-chip-${meta().kind})` }}>
        <Icon name={meta().icon} size="chip" />
        <b class="tds-chip-card-title">{props.name}</b>
      </span>
      <span class="tds-chip-card-site">{extension(props.name)} file</span>
      <span class="tds-chip-card-line">Opens in a new tab</span>
    </>
  )
}

function SkillCardBody(props: { name: string }) {
  const skill = () => skillList().find((entry) => entry.name === props.name)
  if (untrack(skills) !== undefined && !untrack(skill)) refreshSkillsFor(props.name)
  return (
    <>
      <span class="tds-chip-card-head" style={{ "--tds-chip-accent": "var(--tds-chip-skill)" }}>
        <Icon name="sparkle" size="chip" />
        <b class="tds-chip-card-title">{props.name}</b>
      </span>
      <span class="tds-chip-card-site">{skill() ? skill()!.description || "Skill" : skills() === undefined ? "Skill" : "Not installed"}</span>
    </>
  )
}
