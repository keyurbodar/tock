import { createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { TextMorph } from "@tock/ui/text-morph"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { afterLayout, animate, prefersReducedMotion } from "@tock/ui/motion"
import { render } from "@solidjs/web"
import { lang } from "sugar-high/lang"
import { extension, fileUrl, formatSize, isImage } from "./attachments"
import { CodeBlock } from "./code"
import { Markdown } from "./markdown"
import { toast } from "../shell/toasts"
import { opening, setOpening, type LightboxItem, type Opening } from "./lightbox-state"
import { openPdf, renderPage } from "../lib/pdf"

const d = tokens.motion.duration
const ease = tokens.motion.curve
const limit = tokens.limit
const px = (value: number) => value + "px"
const flip = (from: DOMRect, to: DOMRect) => "translate(" + (from.x - to.x) + "px, " + (from.y - to.y) + "px) scale(" + from.width / to.width + ", " + from.height / to.height + ")"
const slide = (dir: number) => "translateX(" + dir * tokens.size["lightbox-slide"] + "px) scale(" + tokens.motion.press + ")"
const clamp = (value: number, max: number) => Math.min(max, Math.max(-max, value))

type Previewable = "html" | "svg" | "md"
type View = "preview" | "source"
/** Files with a rendered view as well as their source: a page, a drawing, a Markdown note. */
const previewable = (name: string): Previewable | undefined => (/\.html?$/i.test(name) ? "html" : /\.svg$/i.test(name) ? "svg" : /\.(md|markdown|mdx)$/i.test(name) ? "md" : undefined)
const sourceLang: Record<Previewable, string> = { html: "html", svg: "xml", md: "md" }

/** What to say when an item will not show, in the words of its kind. */
const failure = (name: string, found: boolean | undefined) => {
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return "This video can’t be played here. Download it to watch it."
  if (/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(name)) return "This audio can’t be played here. Download it to listen."
  if (/\.pdf$/i.test(name)) return "PDF unavailable. The file may have been moved, deleted or damaged."
  if (isImage(name)) return found ? "This file isn’t a valid image. Download it to open it elsewhere." : "Image unavailable. The file may have been moved or deleted."
  return "Document unavailable. The file may have been moved or deleted."
}

/** No scripts, no network but styles, fonts and pictures, nothing that can reach back into Tock: the sandbox gives the page an opaque origin and this policy caps what it loads. */
const PAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src data: blob: https:; form-action 'none'; base-uri 'none'"
const withPolicy = (html: string) => {
  const meta = '<meta http-equiv="Content-Security-Policy" content="' + PAGE_POLICY + '">'
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html
}

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
  const [found, setFound] = createSignal<Record<string, boolean>>({})
  const [pages, setPages] = createSignal<Record<string, number>>({})
  const [view, setView] = createSignal<View>("preview")
  const texts = new Map<string, string>()
  let root!: HTMLDivElement
  let stage!: HTMLDivElement
  let pan = { x: 0, y: 0 }
  let drag: { id: number; x: number; y: number; panX: number; panY: number; touch: boolean; moved: boolean } | undefined

  for (const item of items)
    void fetch(fileUrl(item.id))
      .then((response) => {
        setFound((all) => ({ ...all, [item.id]: response.ok }))
        return response.ok ? response.blob() : undefined
      })
      .then((blob) => blob && setSizes((all) => ({ ...all, [item.id]: blob.size })))
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

  /** The rendered view. A page renders at a desktop width in a sandboxed frame and is scaled down to the box, like a thumbnail of the real thing that still scrolls and clicks. */
  const preview = (kind: Previewable, body: string, name: string): HTMLElement => {
    const pane = document.createElement("div")
    pane.className = "tds-lightbox-preview"
    if (kind === "html") {
      const frame = document.createElement("iframe")
      frame.setAttribute("sandbox", "")
      frame.setAttribute("referrerpolicy", "no-referrer")
      frame.title = name
      frame.srcdoc = withPolicy(body)
      const page = tokens.size["lightbox-page"]
      const fit = () => {
        const scale = pane.clientWidth / page
        if (!scale) return
        frame.style.width = px(page)
        frame.style.height = px(pane.clientHeight / scale)
        frame.style.transform = "scale(" + scale + ")"
      }
      const observer = new ResizeObserver(fit)
      observer.observe(pane)
      mounted.push(() => observer.disconnect())
      pane.append(frame)
      return pane
    }
    if (kind === "svg") {
      const url = URL.createObjectURL(new Blob([body], { type: "image/svg+xml" }))
      mounted.push(() => URL.revokeObjectURL(url))
      const img = document.createElement("img")
      img.src = url
      img.alt = name
      img.draggable = false
      pane.append(img)
      return pane
    }
    pane.classList.add("tds-scroll")
    pane.dataset.edgeFade = "y"
    mounted.push(render(() => <div class="tds-lightbox-md"><Markdown text={body} /></div>, pane))
    return pane
  }

  /** The source, in the one CodeBlock, drawn the first time someone asks for it. */
  const source = (kind: Previewable, body: string): HTMLElement => {
    const pane = document.createElement("div")
    pane.className = "tds-lightbox-source"
    mounted.push(render(() => <CodeBlock code={body} lang={sourceLang[kind]} />, pane))
    return pane
  }

  const choose = (next: View) => {
    setView(next)
    const doc = current()
    if (!doc?.classList.contains("tds-lightbox-previewable")) return
    doc.dataset.view = next
    const kind = doc.dataset.kind as Previewable
    const body = texts.get(untrack(item).id)
    if (next === "source" && body !== undefined && !doc.querySelector(".tds-lightbox-source")) doc.append(source(kind, body))
  }

  /**
   * A picture smaller than the minimum box grows to it (crisp pixels when it is tiny), and a strip too thin to read
   * keeps its short side and scrolls along its long one instead of shrinking to a sliver.
   */
  const fitSmall = (img: HTMLImageElement) => {
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) return
    const gutter = tokens.size["lightbox-nav-x"] + tokens.size["lightbox-nav"]
    const boxW = Math.min(tokens.size["lightbox-w"], innerWidth - gutter * 2)
    const boxH = Math.min(tokens.size["lightbox-h"], innerHeight - gutter * 3)
    const min = tokens.size["lightbox-min"]
    const fit = Math.min(1, boxW / w, boxH / h)
    if (Math.max(w, h) < min) {
      const grow = min / Math.max(w, h)
      img.style.width = px(w * grow)
      img.style.height = px(h * grow)
      if (Math.max(w, h) < tokens.size["lightbox-pixelated"]) img.dataset.pixelated = ""
      return
    }
    if (Math.min(w, h) * fit >= min) return
    const keep = Math.min(1, (w < h ? boxW : boxH) / Math.min(w, h))
    img.dataset.long = w < h ? "y" : "x"
    stage.dataset.edgeFade = img.dataset.long
    img.style.width = px(w * keep)
    img.style.height = px(h * keep)
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
    if (/\.pdf$/i.test(item.name)) {
      const doc = document.createElement("div")
      doc.className = "tds-lightbox-doc tds-lightbox-pdf tds-scroll"
      doc.dataset.edgeFade = "y"
      void openPdf(fileUrl(item.id))
        .then(async (pdf) => {
          setPages((all) => ({ ...all, [item.id]: pdf.numPages }))
          for (let n = 1; n <= Math.min(pdf.numPages, limit["pdf-pages"]) && doc.isConnected !== false; n++) {
            const page = await renderPage(pdf, n, tokens.size["lightbox-doc"])
            page.className = "tds-lightbox-page"
            page.dataset.page = String(n)
            doc.append(page)
          }
        })
        .catch(() => setFailed((all) => ({ ...all, [item.id]: true })))
      return doc
    }
    const kind = previewable(item.name)
    if (kind) {
      const doc = document.createElement("div")
      doc.className = "tds-lightbox-doc tds-lightbox-previewable"
      doc.dataset.kind = kind
      doc.dataset.view = "preview"
      void fetch(fileUrl(item.id))
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error("missing"))))
        .then((text) => {
          const body = text.slice(0, limit["lightbox-text"])
          texts.set(item.id, body)
          doc.append(preview(kind, body, item.name))
          if (doc.dataset.view === "source") doc.append(source(kind, body))
        })
        .catch(() => setFailed((all) => ({ ...all, [item.id]: true })))
      return doc
    }
    if (!isImage(item.name)) {
      const doc = document.createElement("div")
      doc.className = "tds-lightbox-doc"
      const pre = document.createElement("pre")
      pre.className = "tds-scroll"
      pre.dataset.edgeFade = "y"
      pre.textContent = "Loading…"
      doc.append(pre)
      void fetch(fileUrl(item.id))
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error("missing"))))
        .then((text) => {
          const body = text.slice(0, limit["lightbox-text"])
          const ext = extension(item.name).toLowerCase()
          if (lang(ext) && lang(ext) !== "plaintext") {
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
    void img.decode().then(() => fitSmall(img), () => undefined)
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
    setView("preview")
    setIndex(next)
    delete stage.dataset.edgeFade
    stage.scrollTo(0, 0)
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
  /** A click into a previewed page hands it focus, and its keys never reach this window; take focus back so Escape and the arrows keep working. */
  const onBlur = () => queueMicrotask(() => {
    if (document.activeElement instanceof HTMLIFrameElement && root.contains(document.activeElement)) root.focus({ preventScroll: true })
  })
  window.addEventListener("blur", onBlur)
  onCleanup(() => window.removeEventListener("blur", onBlur))
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
    if (event.button !== 0 || !(event.target as HTMLElement).closest("img.tds-lightbox-picture:not([data-long])")) return
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
      afterLayout(img, () => {
        const start = flip(from.getBoundingClientRect(), img.getBoundingClientRect())
        root.focus({ preventScroll: true })
        from.style.visibility = "hidden"
        animate(root, [{ backgroundColor: "transparent" }, { backgroundColor: "var(--tds-overlay-lightbox)" }], { duration: d.swap, fill: "forwards" })
        animate(img, [{ transform: start, transformOrigin: "0 0", borderRadius: px(tokens.radius["lightbox-from"]) }, { transform: "none", transformOrigin: "0 0", borderRadius: px(tokens.radius.lightbox) }], { duration: d["lightbox-open"], easing: ease.sheet })
        setTimeout(() => setReady(true), prefersReducedMotion() ? 0 : d.menu)
      })
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
      data-failed={failed()[item().id] ? "" : undefined}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, .tds-lightbox-stage")) close()
      }}
    >
      <div class="tds-lightbox-bar">
        <b>{item().name}</b>
        <em class="num">
          <Show when={items.length > 1}>
            <span class="tds-lightbox-count" aria-live="polite" aria-atomic="true">
              <TextMorph value={index() + 1 + " of " + items.length} mode="calm" />
            </span>
          </Show>
          <Show when={sizes()[item().id]}>{(bytes) => <span><TextMorph value={formatSize(bytes())} mode="calm" /></span>}</Show>
          <Show when={pages()[item().id]}>{(count) => <span>{count() === 1 ? "1 page" : count() + " pages"}</span>}</Show>
        </em>
        <Show when={previewable(item().name)}>
          <div class="tds-lightbox-views tds-over" role="group" aria-label="View">
            <button type="button" aria-label="Preview" aria-pressed={view() === "preview" ? "true" : "false"} onClick={() => choose("preview")}>
              <Icon name="eye" size="chip" />
              <span>Preview</span>
            </button>
            <button type="button" aria-label="Source" aria-pressed={view() === "source" ? "true" : "false"} onClick={() => choose("source")}>
              <Icon name="code" size="chip" />
              <span>Source</span>
            </button>
          </div>
        </Show>
        <button type="button" class="tds-lightbox-button tds-over" data-action="download" aria-label="Download" onClick={() => download()}>
          <Icon name="download-simple" size="menu" />
          <span>Download</span>
        </button>
        <button type="button" class="tds-lightbox-button tds-over" data-action="copy" aria-label="Copy" onClick={() => void copy()}>
          <Icon name="copy" size="menu" />
          <span>Copy</span>
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
      <Show when={isImage(item().name) && !previewable(item().name) && !failed()[item().id]}>
        <div class="tds-lightbox-zoom tds-over" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" disabled={zoom() <= 1} onClick={() => zoomTo(untrack(zoom) / limit["zoom-step"])}>
            <Icon name="minus" size="chip" />
          </button>
          <span class="num"><TextMorph value={Math.round(zoom() * 100) + "%"} mode="calm" /></span>
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
        <div class="tds-lightbox-failed" role="alert">
          <span class="tds-lightbox-failed-glyph"><Icon name={isImage(item().name) ? "image" : "file"} size="menu" /></span>
          <p>{failure(item().name, found()[item().id])}</p>
        </div>
      </Show>
      <Show when={items.length > 1}>
        <button type="button" class="tds-lightbox-nav tds-over" data-dir="prev" aria-label="Previous image" onClick={() => show(untrack(index) - 1, -1)}>
          <Icon name="caret-left" size="lightbox-nav" />
        </button>
        <button type="button" class="tds-lightbox-nav tds-over" data-dir="next" aria-label="Next image" onClick={() => show(untrack(index) + 1, 1)}>
          <Icon name="caret-right" size="lightbox-nav" />
        </button>
        <div class="tds-lightbox-film tds-over" data-edge-fade="x">
          <For each={items} keyed={(entry) => entry.id}>
            {(entry, i) => (
              <button type="button" data-on={i() === index() ? "" : undefined} aria-label={entry().name} aria-current={i() === index() ? "true" : undefined} onClick={() => show(untrack(i), untrack(i) > untrack(index) ? 1 : -1)}>
                <Show when={isImage(entry().name) && !failed()[entry().id]} fallback={<span class="tds-lightbox-film-doc">{entry().name.split(".").pop()?.toUpperCase()}</span>}>
                  <img src={fileUrl(entry().id)} alt="" draggable={false} onError={() => setFailed((all) => ({ ...all, [untrack(entry).id]: true }))} />
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
