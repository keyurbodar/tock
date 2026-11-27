import { createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { TextMorph } from "@tock/ui/text-morph"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { animate, prefersReducedMotion } from "@tock/ui/motion"
import { render } from "@solidjs/web"
import { lang } from "sugar-high/lang"
import { extension, fileUrl, formatSize, isImage } from "./attachments"
import { CodeBlock } from "./code"
import { Markdown } from "./markdown"
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
const limit = tokens.limit
const px = (value: number) => value + "px"
const flip = (from: DOMRect, to: DOMRect) => "translate(" + (from.x - to.x) + "px, " + (from.y - to.y) + "px) scale(" + from.width / to.width + ", " + from.height / to.height + ")"
const slide = (dir: number) => "translateX(" + dir * tokens.size["lightbox-slide"] + "px) scale(" + tokens.motion.press + ")"
const clamp = (value: number, max: number) => Math.min(max, Math.max(-max, value))

/** Warms the browser cache so the next arrow press lands on a decoded picture (as T3Code preloads neighbours). */
function preload(item: LightboxItem | undefined) {
  if (!item) return
  const img = new Image()
  img.src = fileUrl(item.id)
  void img.decode().catch(() => undefined)
}

function Viewer(props: { opening: Opening }) {
  const { items, from, index: start } = untrack(() => props.opening)
  const returnFocusVisible = from.matches(":focus-visible")
  const mounted: (() => void)[] = []
  const [index, setIndex] = createSignal(start)
  const [ready, setReady] = createSignal(false)
  const [closing, setClosing] = createSignal(false)
  const [zoom, setZoom] = createSignal(1)
  const [failed, setFailed] = createSignal<Record<string, true>>({})
  const [sizes, setSizes] = createSignal<Record<string, number>>({})
  let root!: HTMLDivElement
  let stage!: HTMLDivElement
  let pan = { x: 0, y: 0 }
  let drag: { id: number; x: number; y: number; panX: number; panY: number; touch: boolean; moved: boolean } | undefined

  for (const item of items)
    void fetch(fileUrl(item.id))
      .then((response) => response.blob())
      .then((blob) => setSizes((all) => ({ ...all, [item.id]: blob.size })))
      .catch(() => undefined)

  const current = () => stage.lastElementChild as HTMLElement | null
  const zoomable = () => current() instanceof HTMLImageElement

  const apply = (instant = false) => {
    const img = current()
    if (!img) return
    const z = untrack(zoom)
    const w = (img.offsetWidth * (z - 1)) / 2
    const h = (img.offsetHeight * (z - 1)) / 2
    pan = { x: clamp(pan.x, w), y: clamp(pan.y, h) }
    img.style.transition = instant || prefersReducedMotion() ? "none" : ""
    img.style.transform = z === 1 && pan.x === 0 ? "" : "translate(" + pan.x + "px, " + pan.y + "px) scale(" + z + ")"
  }

  /** Zooms around a viewport point, so what is under the pointer stays under it. */
  const zoomTo = (next: number, at?: { x: number; y: number }) => {
    const img = current()
    if (!img || !zoomable()) return
    const z = untrack(zoom)
    const clamped = Math.min(limit["zoom-max"], Math.max(1, next))
    if (clamped === z) return
    const box = stage.getBoundingClientRect()
    const px0 = at ? at.x - (box.x + box.width / 2) : 0
    const py0 = at ? at.y - (box.y + box.height / 2) : 0
    pan = clamped === 1 ? { x: 0, y: 0 } : { x: px0 - ((px0 - pan.x) * clamped) / z, y: py0 - ((py0 - pan.y) * clamped) / z }
    setZoom(clamped)
    apply()
  }

  const picture = (item: LightboxItem): HTMLElement => {
    if (/\.(mp4|mov|webm|m4v)$/i.test(item.name)) {
      const video = document.createElement("video")
      video.src = fileUrl(item.id)
      video.controls = true
      video.autoplay = true
      video.playsInline = true
      video.className = "tds-lightbox-picture tds-lightbox-video"
      video.onerror = () => setFailed((all) => ({ ...all, [item.id]: true }))
      return video
    }
    if (!isImage(item.name)) {
      const doc = document.createElement("div")
      doc.className = "tds-lightbox-doc"
      const pre = document.createElement("pre")
      pre.className = "tds-scroll"
      pre.textContent = "Loading…"
      doc.append(pre)
      void fetch(fileUrl(item.id))
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error("missing"))))
        .then((text) => {
          const body = text.slice(0, limit["lightbox-text"])
          const ext = extension(item.name).toLowerCase()
          if (ext === "md" || ext === "markdown" || ext === "mdx") {
            pre.remove()
            mounted.push(render(() => <div class="tds-lightbox-md"><Markdown text={body} /></div>, doc))
          } else if (lang(ext) && lang(ext) !== "plaintext") {
            pre.remove()
            mounted.push(render(() => <CodeBlock code={body} lang={ext} />, doc))
          } else pre.textContent = body
        })
        .catch(() => setFailed((all) => ({ ...all, [item.id]: true })))
      return doc
    }
    const img = document.createElement("img")
    img.src = fileUrl(item.id)
    img.alt = item.name
    img.draggable = false
    img.className = "tds-lightbox-picture"
    img.onerror = () => setFailed((all) => ({ ...all, [item.id]: true }))
    return img
  }

  const show = (next: number, dir: -1 | 1) => {
    if (untrack(closing)) return
    if (next < 0 || next >= items.length) {
      animate(stage, [{ transform: "none" }, { transform: "translateX(" + dir * tokens.size["lightbox-bounce"] + "px)" }, { transform: "none" }], { duration: d.swap, easing: ease.std })
      return
    }
    if (next === untrack(index)) return
    const old = current()
    const img = picture(items[next]!)
    pan = { x: 0, y: 0 }
    setZoom(1)
    setIndex(next)
    preload(items[next + dir])
    if (old) {
      old.style.position = "absolute"
      animate(old, [{ opacity: 1, transform: old.style.transform || "none" }, { opacity: 0, transform: slide(-dir) }], { duration: d.layout, easing: ease.std }).onfinish = () => old.remove()
    }
    stage.append(img)
    animate(img, [{ opacity: 0, transform: slide(dir) }, { opacity: 1, transform: "none" }], { duration: d.swap, easing: ease.std })
  }

  const close = () => {
    if (untrack(closing)) return
    setClosing(true)
    const img = current()
    const done = () => {
      from.style.visibility = ""
      setOpening(undefined)
      if (from.isConnected) from.focus({ preventScroll: true, focusVisible: returnFocusVisible } as FocusOptions)
    }
    animate(root, [{ backgroundColor: "var(--tds-overlay-lightbox)" }, { backgroundColor: "transparent" }], { duration: d["lightbox-fade"], fill: "forwards" })
    if (!img) return done()
    const settled = img.style.transform
    img.style.transform = ""
    if (!from.isConnected || untrack(index) !== start) {
      animate(img, [{ opacity: 1, transform: settled || "none" }, { opacity: 0, transform: "scale(" + tokens.motion.press + ")" }], { duration: d.exit, easing: ease.in, fill: "forwards" }).onfinish = done
      return
    }
    animate(img, [{ transform: settled || "none", transformOrigin: "50% 50%" }, { transform: flip(from.getBoundingClientRect(), img.getBoundingClientRect()), transformOrigin: "0 0", borderRadius: px(tokens.radius["lightbox-from"]) }], { duration: d["lightbox-close"], easing: ease.sheet, fill: "forwards" }).onfinish = done
  }

  const trap = (event: KeyboardEvent) => {
    const stops = [...root.querySelectorAll<HTMLElement>("button")]
    if (!stops.length) return
    const at = stops.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length
    stops[next]!.focus()
  }

  const onKey = (event: KeyboardEvent) => {
    const key = event.key
    const zoomed = untrack(zoom) > 1
    const step = limit["lightbox-pan"]
    const handled = (() => {
      if (key === "Escape") return close(), true
      if (key === "Tab") return trap(event), true
      if (key === "+" || key === "=") return zoomTo(untrack(zoom) * limit["zoom-step"]), true
      if (key === "-") return zoomTo(untrack(zoom) / limit["zoom-step"]), true
      if (key === "0") return zoomTo(1), true
      if (!key.startsWith("Arrow")) return false
      if (zoomed) {
        pan = { x: pan.x + (key === "ArrowLeft" ? step : key === "ArrowRight" ? -step : 0), y: pan.y + (key === "ArrowUp" ? step : key === "ArrowDown" ? -step : 0) }
        return apply(), true
      }
      if (key !== "ArrowLeft" && key !== "ArrowRight") return false
      const dir = key === "ArrowLeft" ? -1 : 1
      return show(untrack(index) + dir, dir), true
    })()
    if (!handled) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  window.addEventListener("keydown", onKey, true)
  onCleanup(() => window.removeEventListener("keydown", onKey, true))
  onCleanup(() => mounted.forEach((dispose) => dispose()))

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault()
      return zoomTo(untrack(zoom) * Math.exp(-event.deltaY * limit["zoom-wheel"]), { x: event.clientX, y: event.clientY })
    }
    if (untrack(zoom) === 1) return
    event.preventDefault()
    pan = { x: pan.x - event.deltaX, y: pan.y - event.deltaY }
    apply(true)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target as HTMLElement).closest("img.tds-lightbox-picture")) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, touch: event.pointerType !== "mouse", moved: false }
    stage.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < limit["lightbox-drag-slop"]) return
    drag.moved = true
    stage.dataset.dragging = ""
    if (untrack(zoom) > 1) {
      pan = { x: drag.panX + dx, y: drag.panY + dy }
      return apply(true)
    }
    if (drag.touch) {
      const img = current()
      if (img) img.style.transform = "translateX(" + dx * limit["lightbox-follow"] + "px)"
    }
  }
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const swiped = drag.touch && drag.moved && untrack(zoom) === 1
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
    delete stage.dataset.dragging
    if (swiped) {
      const img = current()
      if (img) img.style.transform = ""
      if (Math.abs(dx) > limit["lightbox-swipe"]) show(untrack(index) + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1)
    }
    setTimeout(() => (drag = undefined))
  }
  const onStageClick = (event: MouseEvent) => {
    if (!drag || drag.moved || !zoomable()) return
    zoomTo(untrack(zoom) > 1 ? 1 : limit["zoom-toggle"], { x: event.clientX, y: event.clientY })
  }

  const mount = (el: HTMLDivElement) => {
    root = el
    requestAnimationFrame(async () => {
      const img = picture(items[start]!)
      stage.append(img)
      preload(items[start + 1])
      preload(items[start - 1])
      if (img instanceof HTMLImageElement) await img.decode().catch(() => undefined)
      from.style.visibility = "hidden"
      animate(root, [{ backgroundColor: "transparent" }, { backgroundColor: "var(--tds-overlay-lightbox)" }], { duration: d.swap, fill: "forwards" })
      animate(img, [{ transform: flip(from.getBoundingClientRect(), img.getBoundingClientRect()), transformOrigin: "0 0", borderRadius: px(tokens.radius["lightbox-from"]) }, { transform: "none", transformOrigin: "0 0", borderRadius: px(tokens.radius.lightbox) }], { duration: d["lightbox-open"], easing: ease.sheet })
      setTimeout(() => setReady(true), prefersReducedMotion() ? 0 : d.menu)
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
      data-material="solid"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label={item().name}
      data-ready={ready() && !closing() ? "" : undefined}
      data-zoomed={zoom() > 1 ? "" : undefined}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, .tds-lightbox-stage")) close()
      }}
    >
      <Show when={items.length > 1}>
        <span class="tds-lightbox-count num" aria-live="polite" aria-atomic="true">
          <TextMorph value={index() + 1 + " / " + items.length} />
        </span>
      </Show>
      <div class="tds-lightbox-bar">
        <b>{item().name}</b>
        <em class="num">
          <Show when={sizes()[item().id]}>{(bytes) => <span><TextMorph value={formatSize(bytes())} /></span>}</Show>
        </em>
        <button type="button" class="tds-lightbox-button tds-over" data-action="download" onClick={() => download()}>
          <Icon name="download-simple" size="menu" />
          Download
        </button>
        <button type="button" class="tds-lightbox-button tds-over" data-action="copy" onClick={() => void copy()}>
          <Icon name="copy" size="menu" />
          Copy
        </button>
        <button type="button" class="tds-lightbox-button tds-over" data-action="close" aria-label="Close" onClick={() => close()}>
          <Icon name="x" size="menu" />
        </button>
      </div>
      <div
        ref={(el) => {
          stage = el
          el.addEventListener("wheel", onWheel, { passive: false })
        }}
        class="tds-lightbox-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onStageClick}
      />
      <Show when={isImage(item().name)}>
        <div class="tds-lightbox-zoom tds-over" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" disabled={zoom() <= 1} onClick={() => zoomTo(untrack(zoom) / limit["zoom-step"])}>
            <Icon name="minus" size="chip" />
          </button>
          <span class="num"><TextMorph value={Math.round(zoom() * 100) + "%"} /></span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo(untrack(zoom) * limit["zoom-step"])}>
            <Icon name="plus" size="chip" />
          </button>
          <button type="button" data-preset="" aria-pressed={zoom() === 1 ? "true" : "false"} onClick={() => zoomTo(1)}>100%</button>
          <button type="button" data-preset="" aria-pressed={zoom() === 2 ? "true" : "false"} onClick={() => zoomTo(2)}>200%</button>
          <button type="button" aria-label="Reset zoom" onClick={() => zoomTo(1)}>
            <Icon name="arrow-counter-clockwise" size="chip" />
          </button>
        </div>
      </Show>
      <Show when={failed()[item().id]}>
        <p class="tds-lightbox-failed" role="alert">Image unavailable. The file may have been moved or deleted.</p>
      </Show>
      <Show when={items.length > 1}>
        <button type="button" class="tds-lightbox-nav tds-over" data-dir="prev" aria-label="Previous image" onClick={() => show(untrack(index) - 1, -1)}>
          <Icon name="caret-left" size="lightbox-nav" />
        </button>
        <button type="button" class="tds-lightbox-nav tds-over" data-dir="next" aria-label="Next image" onClick={() => show(untrack(index) + 1, 1)}>
          <Icon name="caret-right" size="lightbox-nav" />
        </button>
        <div class="tds-lightbox-film tds-over">
          <For each={items} keyed={(entry) => entry.id}>
            {(entry, i) => (
              <button type="button" data-on={i() === index() ? "" : undefined} aria-label={entry().name} aria-current={i() === index() ? "true" : undefined} onClick={() => show(untrack(i), untrack(i) > untrack(index) ? 1 : -1)}>
                <Show when={isImage(entry().name)} fallback={<span class="tds-lightbox-film-doc">{entry().name.split(".").pop()?.toUpperCase()}</span>}>
                  <img src={fileUrl(entry().id)} alt="" draggable={false} />
                </Show>
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
