import { DEFAULT_EFFECT, EFFECTS, WALLPAPER_APPEARANCE, WALLPAPER_RANGE, type Effect, type WallpaperAppearance } from "./effects"
import { DEFAULT_WALLPAPER_THEME, WALLPAPER_THEMES, type WallpaperTheme } from "./themes"
import { COLOR_THEMES } from "./tokens"

export type Mode = "light" | "dark" | "system"

export interface Appearance {
  readonly mode: Mode
  readonly theme: string
  readonly wallpaper: string | null
  readonly effect: Effect
  readonly look: WallpaperAppearance
  readonly linked: boolean
}

export const CUSTOM_THEME_ATTR = "custom"

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "dark",
  theme: DEFAULT_WALLPAPER_THEME,
  wallpaper: DEFAULT_WALLPAPER_THEME,
  effect: DEFAULT_EFFECT,
  look: WALLPAPER_APPEARANCE,
  linked: true,
}

export const wallpaperTheme = (id: string | null): WallpaperTheme | undefined =>
  WALLPAPER_THEMES.find((theme) => theme.id === id)

export const wallpaperImage = (appearance: Appearance): string | null =>
  wallpaperTheme(appearance.wallpaper)?.wallpaper ?? null

export const withWallpaper = (appearance: Appearance, wallpaper: string | null): Appearance => {
  const linked = appearance.linked ? wallpaperTheme(wallpaper) : undefined
  return linked === undefined
    ? { ...appearance, wallpaper }
    : { ...appearance, wallpaper, theme: linked.id, mode: linked.mode, effect: linked.effect }
}

export const withTheme = (appearance: Appearance, theme: string): Appearance => {
  const linked = appearance.linked ? wallpaperTheme(theme) : undefined
  return linked === undefined
    ? { ...appearance, theme }
    : { ...appearance, theme, mode: linked.mode, wallpaper: linked.wallpaper === null ? null : linked.id }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const clamp = (value: unknown, fallback: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback

export function parseAppearance(raw: unknown): Appearance {
  if (!isRecord(raw)) return DEFAULT_APPEARANCE
  const look = isRecord(raw.look) ? raw.look : {}
  const theme = typeof raw.theme === "string" ? raw.theme : DEFAULT_APPEARANCE.theme
  const known = wallpaperTheme(theme) !== undefined || theme in COLOR_THEMES
  return {
    mode: raw.mode === "light" || raw.mode === "dark" || raw.mode === "system" ? raw.mode : DEFAULT_APPEARANCE.mode,
    theme: known ? theme : DEFAULT_APPEARANCE.theme,
    wallpaper: typeof raw.wallpaper === "string" && wallpaperTheme(raw.wallpaper) ? raw.wallpaper : null,
    effect: EFFECTS.find((effect) => effect === raw.effect) ?? DEFAULT_EFFECT,
    look: {
      brightness: clamp(look.brightness, WALLPAPER_APPEARANCE.brightness, WALLPAPER_RANGE.brightness),
      blur: clamp(look.blur, WALLPAPER_APPEARANCE.blur, WALLPAPER_RANGE.blur),
      fade: clamp(look.fade, WALLPAPER_APPEARANCE.fade, WALLPAPER_RANGE.fade),
      opacity: clamp(look.opacity, WALLPAPER_APPEARANCE.opacity, WALLPAPER_RANGE.opacity),
      overlay: clamp(look.overlay, WALLPAPER_APPEARANCE.overlay, WALLPAPER_RANGE.overlay),
      inputOpacity: clamp(look.inputOpacity, WALLPAPER_APPEARANCE.inputOpacity, WALLPAPER_RANGE.inputOpacity),
    },
    linked: raw.linked !== false,
  }
}

export const resolveMode = (mode: Mode, prefersDark: boolean): "light" | "dark" =>
  mode === "system" ? (prefersDark ? "dark" : "light") : mode

export function applyAppearance(root: HTMLElement, appearance: Appearance, prefersDark: boolean): void {
  const custom = wallpaperTheme(appearance.theme)
  const mode = resolveMode(appearance.mode, prefersDark)
  for (const name of Array.from(root.style)) if (name.startsWith("--")) root.style.removeProperty(name)
  root.classList.toggle("dark", mode === "dark")
  root.style.colorScheme = mode
  if (custom === undefined) {
    root.dataset.colorTheme = appearance.theme
  } else {
    root.dataset.colorTheme = CUSTOM_THEME_ATTR
    for (const [name, value] of Object.entries(custom.tokens)) root.style.setProperty(`--${name}`, value)
  }
  root.style.setProperty("--composer-opacity", String(appearance.look.inputOpacity / 100))
}
