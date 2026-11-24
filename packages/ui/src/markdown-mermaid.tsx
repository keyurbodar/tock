import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Button } from "./button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog"
import { glyphs } from "./glyph"
import { PanZoomControls } from "./lightbox"
import { CopyCodeButton } from "./markdown-code"
import { clampZoom, usePanZoom } from "./pan-zoom"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

interface Diagram {
  readonly svg: string
  readonly width: number
  readonly height: number
}

const FILL = /(?:^|;)\s*fill\s*:\s*([^;]+)/
const OPACITY = /(?:^|;)\s*(?:fill-)?opacity\s*:/
const INKS = [
  [27, 27, 29],
  [247, 247, 248],
] as const
const STREAM_DELAY_MS = 250
const FIT = 0.95
const TITLES: Record<string, string> = {
  flowchart: "Flowchart",
  graph: "Flowchart",
  sequenceDiagram: "Sequence diagram",
  classDiagram: "Class diagram",
  stateDiagram: "State diagram",
  "stateDiagram-v2": "State diagram",
  erDiagram: "ER diagram",
  gantt: "Gantt chart",
  pie: "Pie chart",
  mindmap: "Mindmap",
  journey: "User journey",
  timeline: "Timeline",
  gitGraph: "Git graph",
  quadrantChart: "Quadrant chart",
}

function titleOf(text: string) {
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  const title = frontmatter?.[1]?.match(/^\s*title:\s*(.+)$/m)?.[1]?.trim()
  if (title) return title
  const keyword = (frontmatter ? text.slice(frontmatter[0].length) : text)
    .split("\n")
    .find((line) => line.trim() && !line.trim().startsWith("%%"))
    ?.trim()
    .match(/^[\w-]+/)?.[0]
  return (keyword && TITLES[keyword]) || "Mermaid diagram"
}

function luminance(rgb: ArrayLike<number>) {
  const [r = 0, g = 0, b = 0] = Array.from(rgb, (value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function themed(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (canvas === null || doc.querySelector("parsererror") !== null) return svg
  const filled = Array.from(doc.querySelectorAll("g > :is(rect, path, polygon, ellipse, circle)[style]")).flatMap((shape) => {
    const fill = shape.getAttribute("style")?.match(FILL)?.[1]?.trim()
    const labels = Array.from(shape.parentElement?.children ?? []).filter(
      (child) => child.tagName === "text" && !FILL.test(child.getAttribute("style") ?? ""),
    )
    if (fill === undefined || labels.length === 0) return []
    canvas.clearRect(0, 0, 1, 1)
    canvas.fillStyle = "transparent"
    canvas.fillStyle = fill
    canvas.fillRect(0, 0, 1, 1)
    const pixel = canvas.getImageData(0, 0, 1, 1).data
    if (pixel[3] !== 255 || OPACITY.test(shape.getAttribute("style") ?? "")) return []
    const base = luminance(pixel.subarray(0, 3))
    const contrast = (ink: readonly number[]) => {
      const other = luminance(ink)
      return (Math.max(base, other) + 0.05) / (Math.min(base, other) + 0.05)
    }
    const [dark, light] = INKS
    return [{ shape, labels, color: `rgb(${(contrast(dark) >= contrast(light) ? dark : light).join(" ")})` }]
  })
  const blocks = Array.from(doc.querySelectorAll(".pele-rect[style]"))
  if (filled.length === 0 && blocks.length === 0) return svg
  for (const block of blocks) {
    block.setAttribute(
      "style",
      (block.getAttribute("style") ?? "").replace(FILL, (match, fill: string) =>
        match.replace(fill, `oklch(from ${fill} var(--mermaid-block-lightness) var(--mermaid-block-chroma) h)`),
      ),
    )
  }
  for (const { shape, labels, color } of filled) {
    shape.removeAttribute("fill-opacity")
    for (const label of labels) label.setAttribute("style", [label.getAttribute("style"), `fill:${color}`].filter(Boolean).join(";"))
  }
  return new XMLSerializer().serializeToString(doc.documentElement)
}

function useDiagram(host: RefObject<HTMLDivElement | null>, text: string, complete: boolean, active: boolean, width: number) {
  const [diagram, setDiagram] = useState<Diagram>()
  const [error, setError] = useState<string>()
  const idPrefix = useId()

  useEffect(() => {
    const element = host.current
    if (!active || !text || !element || width === 0) return
    let cancelled = false
    const run = async () => {
      const pele = await import("pele/lazy")
      if (cancelled) return
      const style = getComputedStyle(element)
      const fontSize = Number.parseFloat(style.fontSize)
      const result = await Promise.resolve()
        .then(() => pele.load(pele.detectType(text)))
        .then(() => {
          const parsed = pele.parse(text)
          return pele.render(parsed, {
            idPrefix,
            fontFamily: style.fontFamily,
            fontSize,
            maxWidth: parsed.type === "sequence" ? Math.max(width, parsed.actors.size * (fontSize * 12 + 32) + 24) : width,
            directionBreakpoint: Number.POSITIVE_INFINITY,
            padding: 12,
            links: false,
            images: false,
          })
        })
        .then(
          (rendered) => ({ diagram: { svg: themed(rendered.svg), width: rendered.width, height: rendered.height }, error: undefined }),
          (cause: unknown) => ({ diagram: undefined, error: cause instanceof Error ? cause.message : String(cause) }),
        )
      if (cancelled) return
      if (result.diagram === undefined) {
        setError(result.error)
        if (complete) setDiagram(undefined)
      } else {
        setDiagram(result.diagram)
        setError(undefined)
      }
    }
    if (complete) {
      void run()
      return () => {
        cancelled = true
      }
    }
    const timer = window.setTimeout(() => void run(), STREAM_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [host, text, complete, active, idPrefix, width])

  return { diagram, error }
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function MermaidDialog({ open, onOpenChange, text, svg }: { open: boolean; onOpenChange: (open: boolean) => void; text: string; svg: string }) {
  const view = usePanZoom()
  const { stage, setStage, pan, zoom, setPan, setZoom, panning, onPointerDown, onPointerMove, onPointerUp } = view

  useLayoutEffect(() => {
    if (!stage) return
    setPan({ x: 0, y: 0 })
    const diagram = stage.querySelector("svg")
    if (!diagram || diagram.clientWidth === 0 || diagram.clientHeight === 0) {
      setZoom(1)
      return
    }
    setZoom(clampZoom(Math.min(stage.clientWidth / diagram.clientWidth, stage.clientHeight / diagram.clientHeight) * FIT))
  }, [stage, setPan, setZoom])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-3rem)] w-[calc(100dvw-3rem)] max-w-none overflow-hidden" onKeyDown={view.onKeyDown}>
        <DialogHeader>
          <div className="col-start-1 row-start-1 flex min-w-0 items-center justify-between gap-2">
            <DialogTitle>{titleOf(text)}</DialogTitle>
          </div>
        </DialogHeader>
        <div
          ref={setStage}
          data-slot="mermaid-stage"
          className="relative mx-5 mb-4 mt-3 min-h-0 flex-1 overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-1 bg-panel"
          style={{ touchAction: "none", cursor: panning ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="flex h-full w-full items-center justify-center motion-reduce:transition-none!"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, willChange: panning ? "transform" : undefined }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <PanZoomControls view={view}>
            <CopyCodeButton text={text} />
          </PanZoomControls>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MarkdownMermaid({ text, complete }: { text: string; complete: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = host.current
    if (!element || seen) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true)
      },
      { rootMargin: "300px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [seen])

  const { diagram, error } = useDiagram(host, text, complete, seen || !complete, width)
  const failed = error !== undefined && complete

  return (
    <div data-component="markdown-mermaid" ref={host}>
      <div data-slot="markdown-code-header">
        <span data-slot="markdown-code-language">mermaid</span>
        <div className="flex items-center gap-0.5">
          {diagram === undefined ? null : (
            <HeaderButton label="Expand" onClick={() => setOpen(true)}>
              {glyphs.expand}
            </HeaderButton>
          )}
          <Tooltip>
            <TooltipTrigger render={<CopyCodeButton text={text} />} />
            <TooltipContent side="bottom">Copy code</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {diagram === undefined ? (
        <>
          {failed ? (
            <p data-slot="markdown-mermaid-error" title={error}>
              {error.split("\n")[0]?.replace(/:$/, "")}
            </p>
          ) : null}
          <pre data-mermaid-fallback={failed ? "" : undefined}>
            <code>{text}</code>
          </pre>
        </>
      ) : (
        <div data-slot="markdown-mermaid-diagram">
          <div style={{ minWidth: Math.round(diagram.width * 0.85) }} dangerouslySetInnerHTML={{ __html: diagram.svg }} />
        </div>
      )}
      {diagram === undefined ? null : <MermaidDialog open={open} onOpenChange={setOpen} text={text} svg={diagram.svg} />}
    </div>
  )
}
