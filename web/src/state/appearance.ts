import { useAtomValue } from "@effect/atom-react"
import { applyAppearance, DEFAULT_APPEARANCE, parseAppearance, type Appearance } from "@tock/theme/apply"
import * as Atom from "effect/reactivity/Atom"
import { registry } from "./registry"

const STORAGE_KEY = "tock.appearance"
const DARK_QUERY = "(prefers-color-scheme: dark)"

function stored(): Appearance {
  try {
    return parseAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export const appearanceAtom = Atom.make(stored()).pipe(Atom.keepAlive)

const paint = (appearance: Appearance) =>
  applyAppearance(document.documentElement, appearance, matchMedia(DARK_QUERY).matches)

export function setAppearance(update: (current: Appearance) => Appearance): void {
  const next = update(registry.get(appearanceAtom))
  registry.set(appearanceAtom, next)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  paint(next)
}

export function startAppearance(): void {
  paint(registry.get(appearanceAtom))
  matchMedia(DARK_QUERY).addEventListener("change", () => paint(registry.get(appearanceAtom)))
}

export const useAppearance = () => useAtomValue(appearanceAtom)
