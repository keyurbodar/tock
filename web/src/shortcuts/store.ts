import { useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { useEffect, useRef } from "react"
import { APPLE } from "../lib/platform"
import { registry } from "../state/registry"
import {
  bindingLabel,
  commandForPress,
  parseOverrides,
  resolveBindings,
  type Binding,
  type CommandId,
  type Focus,
  type Overrides,
} from "./keybindings"

const STORAGE_KEY = "tock.keybinds"
const EDITABLE = "input, textarea, select, [contenteditable=true]"
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]"
const COMPOSER = "[data-slot=composer]"
const CAPTURE = "[data-keybinding-capture]"

function stored(): Overrides {
  try {
    return parseOverrides(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
  } catch {
    return {}
  }
}

const overridesAtom = Atom.make(stored()).pipe(Atom.keepAlive)
const bindingsAtom = Atom.make((get) => resolveBindings(get(overridesAtom))).pipe(Atom.keepAlive)

export const useOverrides = (): Overrides => useAtomValue(overridesAtom)
export const useBindings = (): readonly Binding[] => useAtomValue(bindingsAtom)

export function saveOverrides(next: Overrides): void {
  if (Object.keys(next).length === 0) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  registry.set(overridesAtom, next)
}

export function useShortcutLabel(command: CommandId): string | undefined {
  const binding = useBindings().find((entry) => entry.command === command)
  return binding === undefined ? undefined : (bindingLabel(binding.key, APPLE) ?? undefined)
}

type Handler = () => boolean | void

const handlers = new Map<CommandId, Handler[]>()

function focusNow(): Focus {
  const focused = document.activeElement
  return {
    editable: focused?.matches(EDITABLE) === true,
    overlay: document.querySelector(OVERLAY) !== null,
    composer: focused?.closest(COMPOSER) != null,
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.target instanceof Element && event.target.closest(CAPTURE) !== null) return
  const command = commandForPress(event, focusNow(), registry.get(bindingsAtom), APPLE)
  const handler = command === null ? undefined : handlers.get(command)?.at(-1)
  if (handler === undefined || handler() === false) return
  event.preventDefault()
  event.stopPropagation()
}

let listening = false

export function useCommand(command: CommandId, handler: Handler): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!listening) {
      listening = true
      addEventListener("keydown", onKeyDown, { capture: true })
    }
    const run: Handler = () => latest.current()
    const stack = handlers.get(command) ?? []
    stack.push(run)
    handlers.set(command, stack)
    return () => {
      const index = stack.lastIndexOf(run)
      if (index !== -1) stack.splice(index, 1)
    }
  }, [command])
}
