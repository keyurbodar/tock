import { createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { animate } from "@tock/motion"
import { fileUrl, formatSize } from "./attachments"
import { toast } from "../shell/toasts"

export interface LightboxItem {
  readonly id: string
  readonly name: string
}

interface Opening {
  readonly items: readonly LightboxItem[]
  readonly index: number
  readonly from: HTMLElement
}

const [opening, setOpening] = createSignal<Opening>()

/** Opens the viewer grown out of the thumbnail `from` (TDS px4 Lightbox); a second open while one is up is ignored. */
export function openLightbox(items: readonly LightboxItem[], index: number, from: HTMLElement) {
  if (untrack(opening)) return
  setOpening({ items, index, from })
}

const d = tokens.motion.duration
const ease = tokens.motion.curve
const px = (value: number) => value + "px"
const flip = (from: DOMRect, to: DOMRect) => "translate(" + (from.x - to.x) + "px, " + (from.y - to.y) + "px) scale(" + from.width / to.width + ", " + from.height / to.height + ")"
const slide = (dir: number) => "translateX(" + dir * tokens.size["lightbox-slide"] + "px) scale(" + tokens.motion.press + ")"

function Viewer(props: { opening: Opening }) {
  const { items, from, index: start } = untrack(() => props.opening)
  const [index, setIndex] = createSignal(start)
  const [ready, setReady] = createSignal(false)
  const [closing, setClosing] = createSignal(false)
  const [sizes, setSizes] = createSignal<Record<string, number>>({})
  let root!: HTMLDivElement
  let stage!: HTMLDivElement

  for (const item of items)
    void fetch(fileUrl(item.id))
      .then((response) => response.blob())
      .then((blob) => setSizes((all) => ({ ...all, [item.id]: blob.size })))
      .catch(() => undefined)

  const picture = (item: LightboxItem) => {
    const img = document.createElement("img")
    img.src = fileUrl(item.id)
    img.alt = item.name
    img.draggable = false
    return img
  }

  const show = (next: number, dir: -1 | 1) => {
    if (untrack(closing)) return
    if (next < 0 || next >= items.length) {
      animate(stage, [{ transform: "none" }, { transform: "translateX(" + dir * tokens.size["lightbox-bounce"] + "px)" }, { transform: "none" }], { duration: d.swap, easing: ease.std })
      return
    }
    if (next === untrack(index)) return
    const old = stage.lastElementChild as HTMLElement | null
    const img = picture(items[next]!)
    setIndex(next)
    if (old) {
      old.style.position = "absolute"
      animate(old, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: slide(-dir) }], { duration: d.layout, easing: ease.std }).onfinish = () => old.remove()
    }
    stage.append(img)
    animate(img, [{ opacity: 0, transform: slide(dir) }, { opacity: 1, transform: "none" }], { duration: d.swap, easing: ease.std })
  }

  const close = () => {
    if (untrack(closing)) return
    setClosing(true)
    const img = stage.lastElementChild as HTMLElement
    const done = () => {
      from.style.visibility = ""
      setOpening(undefined)
    }
    animate(root, [{ backgroundColor: "var(--tds-overlay-lightbox)" }, { backgroundColor: "transparent" }], { duration: d["lightbox-fade"], fill: "forwards" })
    if (!img) return done()
    if (!from.isConnected || untrack(index) !== start) {
      animate(img, [{ opacity: 1 }, { opacity: 0, transform: "scale(" + tokens.motion.press + ")" }], { duration: d.exit, easing: ease.in, fill: "forwards" }).onfinish = done
      return
    }
    animate(img, [{ transform: "none", transformOrigin: "0 0" }, { transform: flip(from.getBoundingClientRect(), img.getBoundingClientRect()), transformOrigin: "0 0", borderRadius: px(tokens.radius["lightbox-from"]) }], { duration: d["lightbox-close"], easing: ease.sheet, fill: "forwards" }).onfinish = done
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.key === "Escape") return close()
    const dir = event.key === "ArrowLeft" ? -1 : 1
    show(untrack(index) + dir, dir)
  }
  window.addEventListener("keydown", onKey, true)
  onCleanup(() => window.removeEventListener("keydown", onKey, true))

  const mount = (el: HTMLDivElement) => {
    root = el
    requestAnimationFrame(async () => {
      const img = picture(items[start]!)
      stage.append(img)
      await img.decode().catch(() => undefined)
      from.style.visibility = "hidden"
      animate(root, [{ backgroundColor: "transparent" }, { backgroundColor: "var(--tds-overlay-lightbox)" }], { duration: d.swap, fill: "forwards" })
      animate(img, [{ transform: flip(from.getBoundingClientRect(), img.getBoundingClientRect()), transformOrigin: "0 0", borderRadius: px(tokens.radius["lightbox-from"]) }, { transform: "none", transformOrigin: "0 0", borderRadius: px(tokens.radius.lightbox) }], { duration: d["lightbox-open"], easing: ease.sheet })
      setTimeout(() => setReady(true), d.menu)
      root.focus({ preventScroll: true })
    })
  }

  const item = () => items[index()]!
  const download = () => {
    const current = untrack(item)
    const link = document.createElement("a")
    link.href = fileUrl(current.id)
    link.download = current.name
    link.click()
    toast("Saved to Downloads", { description: current.name, icon: "download-simple", id: "lightbox-download", duration: tokens.motion.toast.copy })
  }
  const copy = async () => {
    const current = untrack(item)
    try {
      const blob = await (await fetch(fileUrl(current.id))).blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch {
      await navigator.clipboard.writeText(new URL(fileUrl(current.id), location.href).href).catch(() => undefined)
    }
    toast("Copied", { description: current.name, id: "lightbox-copy", duration: tokens.motion.toast.copy })
  }

  return (
    <div
      ref={mount}
      class="tds-lightbox"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label={item().name}
      data-ready={ready() && !closing() ? "" : undefined}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, .tds-lightbox-stage > *")) close()
      }}
    >
      <div class="tds-lightbox-bar">
        <b>{item().name}</b>
        <em class="num">
          <Show when={items.length > 1}>
            <span class="tds-lightbox-count">{index() + 1 + " of " + items.length}</span>
          </Show>
          <Show when={sizes()[item().id]}>{(bytes) => <span>{formatSize(bytes())}</span>}</Show>
        </em>
        <button type="button" class="tds-lightbox-button" data-action="download" onClick={() => download()}>
          <Icon name="download-simple" size="menu" />
          Download
        </button>
        <button type="button" class="tds-lightbox-button" data-action="copy" onClick={() => void copy()}>
          <Icon name="copy" size="menu" />
          Copy
        </button>
        <button type="button" class="tds-lightbox-button" data-action="close" aria-label="Close" onClick={() => close()}>
          <Icon name="x" size="menu" />
        </button>
      </div>
      <div ref={(el) => (stage = el)} class="tds-lightbox-stage" />
      <Show when={items.length > 1}>
        <button type="button" class="tds-lightbox-nav" data-dir="prev" aria-label="Previous image" onClick={() => show(untrack(index) - 1, -1)}>
          <Icon name="caret-left" size="lightbox-nav" />
        </button>
        <button type="button" class="tds-lightbox-nav" data-dir="next" aria-label="Next image" onClick={() => show(untrack(index) + 1, 1)}>
          <Icon name="caret-right" size="lightbox-nav" />
        </button>
        <div class="tds-lightbox-film">
          <For each={items} keyed={(entry) => entry.id}>
            {(entry, i) => (
              <button type="button" data-on={i() === index() ? "" : undefined} aria-label={entry().name} onClick={() => show(untrack(i), untrack(i) > untrack(index) ? 1 : -1)}>
                <img src={fileUrl(entry().id)} alt="" draggable={false} />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function Lightbox() {
  return <Show when={opening()}>{(current) => <Viewer opening={current()} />}</Show>
}
