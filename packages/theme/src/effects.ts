import type { Tokens } from "./tokens"

export const EFFECTS = ["none", "dither", "grain", "vignette"] as const
export type Effect = (typeof EFFECTS)[number]
export const DEFAULT_EFFECT: Effect = "dither"

export interface WallpaperAppearance {
  readonly brightness: number
  readonly blur: number
  readonly fade: number
  readonly opacity: number
  readonly overlay: number
  readonly inputOpacity: number
}

export const WALLPAPER_APPEARANCE: WallpaperAppearance = {
  brightness: 100,
  blur: 0,
  fade: 100,
  opacity: 100,
  overlay: 0,
  inputOpacity: 100,
}

export const WALLPAPER_RANGE: WallpaperAppearance = {
  brightness: 200,
  blur: 24,
  fade: 100,
  opacity: 100,
  overlay: 100,
  inputOpacity: 100,
}

export const WEBGL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
}

export const WALLPAPER_DITHER = {
  type: "8x8",
  size: 2,
  colorSteps: 4,
  originalColors: true,
  fit: "cover",
  speed: 0,
  frame: 0,
  minPixelRatio: 1,
} as const

export const FABRIC = {
  shape: "simplex",
  type: "8x8",
  size: 3,
  scale: 2,
  frame: 40_000,
  animationSpeed: 0.5,
  fps: 30,
  minPixelRatio: 1,
  colorBack: "#00000000",
  inkFallback: "#778abd",
  monoFallback: "#8c8c8c",
  colorTweenMs: 900,
  colorTweenPower: 4,
} as const

export const BACKDROP_MOTION = {
  areaMs: 240,
  unmaskMs: 200,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const

export const EFFECT_LIGHT: Tokens = {
  "wallpaper-opacity": "0.6",
  "fabric-opacity": "0.2",
  "fabric-blend": "multiply",
  "fabric-mask":
    "radial-gradient(ellipse 150% 135% at 50% 110%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.45) 66%, rgba(0,0,0,1) 92%)",
  "fabric-mask-open": "linear-gradient(rgb(0 0 0 / var(--fabric-unmask)) 0 0)",
  "gradient-wallpaper-fade":
    "linear-gradient(to bottom, transparent 30%, color-mix(in srgb, var(--panel) 48%, transparent) 48%, color-mix(in srgb, var(--panel) 86%, transparent) 66%, var(--panel) 82%)",
  "effect-grain-image": 'url("/textures/grain.svg")',
  "effect-grain-size": "160px 160px",
  "effect-grain-blend": "soft-light",
  "effect-grain-opacity": "0.35",
  "gradient-vignette": "radial-gradient(ellipse at center, transparent 25%, rgb(0 0 0 / 0.45) 100%)",
}

export const EFFECT_DARK: Tokens = {
  "wallpaper-opacity": "0.7",
  "fabric-opacity": "0.25",
  "fabric-blend": "screen",
  "gradient-wallpaper-fade":
    "linear-gradient(to bottom, transparent 12%, color-mix(in srgb, var(--panel) 30%, transparent) 34%, color-mix(in srgb, var(--panel) 68%, transparent) 52%, color-mix(in srgb, var(--panel) 92%, transparent) 70%, var(--panel) 88%)",
}
