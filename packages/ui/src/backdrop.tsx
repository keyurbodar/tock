import { Dithering, ImageDithering, type PaperShaderElement } from "@paper-design/shaders-react"
import {
  DEFAULT_EFFECT,
  FABRIC,
  WALLPAPER_APPEARANCE,
  WALLPAPER_DITHER,
  WEBGL_ATTRIBUTES,
  type Effect,
  type WallpaperAppearance,
} from "@tock/theme/effects"
import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import { cn } from "./cn"

const CANVAS = "[&_canvas]:[image-rendering:pixelated]"

function resolveColor(value: string): string | undefined {
  const probe = document.createElement("div")
  probe.style.color = value
  probe.style.display = "none"
  document.body.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d")
  if (!context) return undefined
  context.fillStyle = resolved
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function useShaderTheme() {
  const [state, setState] = useState({
    ready: false,
    dark: false,
    reducedMotion: false,
    ink: FABRIC.inkFallback as string,
    mono: FABRIC.monoFallback as string,
  })

  useEffect(() => {
    const context = document.createElement("canvas").getContext("webgl2", WEBGL_ATTRIBUTES)
    const supported = context !== null
    context?.getExtension("WEBGL_lose_context")?.loseContext()
    const root = document.documentElement
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const read = () =>
      setState({
        ready: supported,
        dark: root.classList.contains("dark"),
        reducedMotion: motion.matches,
        ink: resolveColor("var(--shader-ink)") ?? FABRIC.inkFallback,
        mono: resolveColor("oklch(from var(--shader-ink) l 0 h)") ?? FABRIC.monoFallback,
      })
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-color-theme", "style"] })
    motion.addEventListener("change", read)
    return () => {
      observer.disconnect()
      motion.removeEventListener("change", read)
    }
  }, [])

  return state
}

function usePixelBudget(size: number) {
  const [maxPixelCount, setMaxPixelCount] = useState<number | null>(null)
  const observe = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return
      const measure = () => {
        const { width, height } = element.getBoundingClientRect()
        setMaxPixelCount(Math.max(1, Math.ceil((width * height) / (size * size))))
      }
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    },
    [size],
  )
  return { maxPixelCount, observe }
}

function useShaderClock(ref: RefObject<PaperShaderElement | null>, animate: boolean) {
  const elapsed = useRef(0)
  useEffect(() => {
    const element = ref.current
    if (!animate || !element) return
    const frameMs = 1000 / FABRIC.fps
    let raf = 0
    let last: number | null = null
    let drawn: number | null = null
    const tick = (now: number) => {
      if (last !== null) elapsed.current += Math.min(now - last, frameMs * 2) * FABRIC.animationSpeed
      last = now
      if (drawn === null || now - drawn >= frameMs) {
        element.paperShaderMount?.setFrame(FABRIC.frame + elapsed.current)
        drawn = drawn === null ? now : drawn + frameMs * Math.max(1, Math.floor((now - drawn) / frameMs))
      }
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      cancelAnimationFrame(raf)
      last = null
      drawn = null
      raf = requestAnimationFrame(tick)
    }
    const visible = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !document.hidden) start()
      else cancelAnimationFrame(raf)
    })
    visible.observe(element)
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start())
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      visible.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      cancelAnimationFrame(raf)
    }
  }, [animate, ref])
}

function EffectOverlay({ effect }: { effect: Effect }) {
  if (effect !== "grain" && effect !== "vignette") return null
  return (
    <div
      aria-hidden="true"
      data-slot="background-effect"
      data-effect={effect}
      className={cn(
        "pointer-events-none absolute inset-0",
        effect === "grain"
          ? "bg-(image:--effect-grain-image) bg-size-(--effect-grain-size) opacity-(--effect-grain-opacity) mix-blend-(--effect-grain-blend)"
          : "bg-(image:--gradient-vignette)",
      )}
    />
  )
}

function Fade({ strength = WALLPAPER_APPEARANCE.fade }: { strength?: number }) {
  return (
    <div
      className="absolute inset-0 bg-(image:--gradient-wallpaper-fade) opacity-(--fade-level)"
      style={{ "--fade-level": strength / 100 } as CSSProperties}
    />
  )
}

function Wallpaper({
  image,
  effect,
  ready,
  appearance,
}: {
  image: string
  effect: Effect
  ready: boolean
  appearance: WallpaperAppearance
}) {
  const { maxPixelCount, observe } = usePixelBudget(1)
  const style = {
    "--wallpaper-level": appearance.opacity / 100,
    filter:
      appearance.brightness === WALLPAPER_APPEARANCE.brightness && appearance.blur === WALLPAPER_APPEARANCE.blur
        ? undefined
        : `brightness(${appearance.brightness / 100}) blur(${appearance.blur}px)`,
  } as CSSProperties

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={observe}
        className="absolute inset-0 opacity-[calc(var(--wallpaper-opacity)*var(--wallpaper-level))] [container-type:size]"
        style={style}
      >
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${image}")` }} />
        {effect === "dither" && ready && maxPixelCount !== null ? (
          <ImageDithering
            className={cn(
              "absolute inset-0 [&_canvas]:transition-opacity [&_canvas]:duration-slower [&_canvas]:starting:opacity-0",
              CANVAS,
            )}
            width="100%"
            height="100%"
            minPixelRatio={WALLPAPER_DITHER.minPixelRatio}
            maxPixelCount={maxPixelCount}
            webGlContextAttributes={WEBGL_ATTRIBUTES}
            image={image}
            fit={WALLPAPER_DITHER.fit}
            type={WALLPAPER_DITHER.type}
            size={WALLPAPER_DITHER.size}
            colorSteps={WALLPAPER_DITHER.colorSteps}
            originalColors={WALLPAPER_DITHER.originalColors}
            speed={WALLPAPER_DITHER.speed}
            frame={WALLPAPER_DITHER.frame}
          />
        ) : null}
        <EffectOverlay effect={effect} />
      </div>
      <div className="absolute inset-0 bg-bg opacity-(--overlay-level)" style={{ "--overlay-level": appearance.overlay / 100 } as CSSProperties} />
      <Fade strength={appearance.fade} />
    </div>
  )
}

function Fabric({ animate, color, masked }: { animate: boolean; color: string; masked: boolean }) {
  const ref = useRef<PaperShaderElement>(null)
  const { maxPixelCount, observe } = usePixelBudget(FABRIC.size)
  useShaderClock(ref, animate && maxPixelCount !== null)

  return (
    <div
      data-fabric-mask=""
      data-masked={masked ? "" : undefined}
      className="pointer-events-none absolute inset-0 opacity-(--fabric-opacity) mix-blend-(--fabric-blend) data-[masked]:mask-(--fabric-mask) data-[masked]:mask-no-repeat"
    >
      <div ref={observe} className="h-full w-full">
        {maxPixelCount === null ? null : (
          <Dithering
            ref={ref}
            className={CANVAS}
            width="100%"
            height="100%"
            minPixelRatio={FABRIC.minPixelRatio}
            maxPixelCount={maxPixelCount}
            webGlContextAttributes={WEBGL_ATTRIBUTES}
            speed={0}
            frame={FABRIC.frame}
            colorBack={FABRIC.colorBack}
            colorFront={color}
            shape={FABRIC.shape}
            type={FABRIC.type}
            size={FABRIC.size}
            scale={FABRIC.scale}
          />
        )}
      </div>
    </div>
  )
}

export function Backdrop({
  image,
  effect = DEFAULT_EFFECT,
  appearance = WALLPAPER_APPEARANCE,
  masked = false,
  paused = false,
  mono = false,
}: {
  image?: string | null
  effect?: Effect
  appearance?: WallpaperAppearance
  masked?: boolean
  paused?: boolean
  mono?: boolean
}) {
  const theme = useShaderTheme()
  const fabric =
    effect === "dither" && theme.ready ? (
      <Fabric animate={!theme.reducedMotion && !paused} color={mono ? theme.mono : theme.ink} masked={masked} />
    ) : null

  return (
    <div aria-hidden="true" data-slot="backdrop" className="pointer-events-none absolute inset-0 overflow-clip">
      <div className="absolute inset-0 bg-panel" />
      <div className="absolute inset-0 bg-(image:--gradient-panel-air) dark:hidden" />
      {image ? (
        <>
          <Wallpaper image={image} effect={effect} ready={theme.ready} appearance={appearance} />
          {fabric}
        </>
      ) : (
        <>
          {fabric}
          <EffectOverlay effect={effect} />
          <div
            data-visible={masked ? "" : undefined}
            className="absolute inset-0 opacity-0 transition-opacity duration-base ease-out-quint data-[visible]:opacity-100"
          >
            <Fade />
          </div>
        </>
      )}
    </div>
  )
}
