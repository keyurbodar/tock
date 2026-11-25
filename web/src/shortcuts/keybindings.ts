export const COMMANDS = [
  { command: "commandMenu.toggle", label: "Open command menu", defaults: ["mod+k"] },
  { command: "sidebar.toggle", label: "Toggle sidebar", defaults: ["mod+b"] },
  {
    command: "thread.stop",
    label: "Stop run",
    defaults: ["mod+."],
    when: "Composer or thread body focused",
  },
  {
    command: "composer.attach",
    label: "Upload attachment",
    defaults: ["mod+/"],
    when: "Composer or thread body focused",
  },
  { command: "thread.new", label: "New chat", defaults: ["mod+shift+o"] },
  { command: "settings.open", label: "Open settings", defaults: ["mod+,"] },
  { command: "composer.focus", label: "Focus composer", defaults: ["mod+i"] },
] as const satisfies readonly { command: string; label: string; defaults: readonly string[]; when?: string }[]

export type CommandId = (typeof COMMANDS)[number]["command"]
export type Overrides = Partial<Record<CommandId, readonly string[] | null>>

export interface Focus {
  readonly editable: boolean
  readonly overlay: boolean
  readonly composer: boolean
}

export interface Chord {
  readonly key: string
  readonly mod: boolean
  readonly ctrl: boolean
  readonly meta: boolean
  readonly alt: boolean
  readonly shift: boolean
}

export interface KeyPress {
  readonly key: string
  readonly code: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly getModifierState: (key: string) => boolean
}

export interface Binding {
  readonly key: string
  readonly command: CommandId
}

const inThread = (focus: Focus) => focus.composer || (!focus.editable && !focus.overlay)

const WHEN: Partial<Record<CommandId, (focus: Focus) => boolean>> = {
  "thread.stop": inThread,
  "composer.attach": inThread,
  "composer.focus": (focus) => !focus.composer,
}

const MODIFIERS = ["mod", "ctrl", "meta", "alt", "shift"] as const
const MODIFIER_NAMES: ReadonlySet<string> = new Set(MODIFIERS)
const ALIASES: Readonly<Record<string, string>> = { space: " ", plus: "+", esc: "escape" }
const BROWSER_RESERVED: ReadonlySet<string> = new Set([
  "mod+n",
  "mod+shift+n",
  "mod+t",
  "mod+shift+t",
  "mod+w",
  "mod+shift+w",
  "mod+q",
  "mod+l",
  "mod+r",
  "mod+shift+r",
])
const BRACKETS: Readonly<Record<string, string>> = { BracketLeft: "[", BracketRight: "]", Backquote: "`" }
const PUNCTUATION: Readonly<Record<string, string>> = {
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backslash: "\\",
}
const KEY_NAMES: Readonly<Record<string, string>> = {
  " ": "Space",
  escape: "Esc",
  enter: "↵",
  backspace: "⌫",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
}
const LABELS = new Map<string, string>(COMMANDS.map((entry) => [entry.command, entry.label]))

export function parseChord(text: string): Chord | null {
  const tokens = text
    .toLowerCase()
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean)
  const keys = tokens.filter((token) => !MODIFIER_NAMES.has(token))
  const [key] = keys
  if (key === undefined || keys.length !== 1) return null
  return {
    key: ALIASES[key] ?? key,
    mod: tokens.includes("mod"),
    ctrl: tokens.includes("ctrl"),
    meta: tokens.includes("meta"),
    alt: tokens.includes("alt"),
    shift: tokens.includes("shift"),
  }
}

export function normalize(text: string): string | null {
  const compact = text.trim().replace(/\s*\+\s*/g, "+")
  const chord = /\s/.test(compact) ? null : parseChord(compact)
  if (chord === null) return null
  const key = chord.key === " " ? "space" : chord.key === "+" ? "plus" : chord.key
  return [...MODIFIERS.filter((name) => chord[name]), key].join("+")
}

const physicalKey = (code: string) =>
  /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase() ?? /^Digit([0-9])$/.exec(code)?.[1] ?? BRACKETS[code] ?? null

const shiftedKey = (press: KeyPress) => (press.shiftKey ? (PUNCTUATION[press.code] ?? null) : null)

function composedKey(press: KeyPress): string | null {
  const key = press.key.toLowerCase()
  return key === "dead" || (press.altKey && /^[^\x20-\x7e]$/u.test(key))
    ? (physicalKey(press.code) ?? PUNCTUATION[press.code] ?? null)
    : null
}

function pressKeys(press: KeyPress): ReadonlySet<string> {
  const key = press.key.toLowerCase()
  const keys = new Set([ALIASES[key] ?? key])
  const physical = physicalKey(press.code) ?? composedKey(press) ?? shiftedKey(press)
  if (physical !== null) keys.add(physical)
  return keys
}

export function bindingFromPress(press: KeyPress, apple: boolean): string | null {
  if (press.getModifierState("AltGraph")) return null
  const key = press.code === "Backquote" ? "`" : (composedKey(press) ?? shiftedKey(press) ?? press.key.toLowerCase())
  if (key === "meta" || key === "control" || key === "alt" || key === "shift") return null
  const tokens: string[] = []
  if (apple ? press.metaKey : press.ctrlKey) tokens.push("mod")
  if (apple && press.ctrlKey) tokens.push("ctrl")
  if (!apple && press.metaKey) tokens.push("meta")
  if (press.altKey) tokens.push("alt")
  if (press.shiftKey) tokens.push("shift")
  tokens.push(key === " " ? "space" : key === "+" ? "plus" : key)
  return normalize(tokens.join("+"))
}

const usesMeta = (chord: Chord, apple: boolean) => chord.meta || (chord.mod && apple)
const usesCtrl = (chord: Chord, apple: boolean) => chord.ctrl || (chord.mod && !apple)

const pressMatches = (press: KeyPress, chord: Chord, apple: boolean) =>
  press.metaKey === usesMeta(chord, apple) &&
  press.ctrlKey === usesCtrl(chord, apple) &&
  press.altKey === chord.alt &&
  press.shiftKey === chord.shift &&
  pressKeys(press).has(chord.key)

const signature = (chord: Chord, apple: boolean) =>
  [chord.key, usesMeta(chord, apple), usesCtrl(chord, apple), chord.alt, chord.shift].join("|")

const keyName = (key: string) =>
  KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))

function modifierNames(chord: Chord, apple: boolean): readonly string[] {
  const names = apple
    ? [usesCtrl(chord, apple) && "⌃", chord.alt && "⌥", chord.shift && "⇧", usesMeta(chord, apple) && "⌘"]
    : [usesCtrl(chord, apple) && "Ctrl", chord.alt && "Alt", chord.shift && "Shift", usesMeta(chord, apple) && "Meta"]
  return names.filter((name) => typeof name === "string")
}

export function bindingParts(binding: string, apple: boolean): readonly string[] | null {
  const chord = parseChord(binding)
  return chord === null ? null : [...modifierNames(chord, apple), keyName(chord.key)]
}

export function bindingLabel(binding: string, apple: boolean): string | null {
  const chord = parseChord(binding)
  if (chord === null) return null
  const names = modifierNames(chord, apple)
  return apple ? names.join("") + keyName(chord.key) : [...names, keyName(chord.key)].join("+")
}

function invalidReason(binding: string): string | null {
  if (BROWSER_RESERVED.has(binding)) return `${binding} is reserved by the browser`
  const chord = parseChord(binding)
  if (chord === null) return "Invalid shortcut"
  return chord.mod || chord.ctrl || chord.meta || chord.alt ? null : `${binding} needs a modifier key`
}

export function resolveBindings(overrides: Overrides): readonly Binding[] {
  return COMMANDS.flatMap((entry) => {
    const override = overrides[entry.command]
    const keys =
      override === undefined
        ? entry.defaults
        : override === null
          ? []
          : override.flatMap((text) => {
              const binding = normalize(text)
              return binding === null || invalidReason(binding) !== null ? [] : [binding]
            })
    return keys.map((key) => ({ key, command: entry.command }))
  })
}

export function bindingConflict(
  text: string,
  command: CommandId,
  bindings: readonly Binding[],
  apple: boolean,
): string | null {
  const binding = normalize(text)
  if (binding === null) return "Invalid shortcut"
  const invalid = invalidReason(binding)
  if (invalid !== null) return invalid
  const chord = parseChord(binding)
  if (chord === null) return "Invalid shortcut"
  const wanted = signature(chord, apple)
  for (const other of bindings) {
    if (other.command === command || WHEN[other.command] !== undefined) continue
    const taken = parseChord(other.key)
    if (taken !== null && signature(taken, apple) === wanted) return `${binding} conflicts with ${LABELS.get(other.command)}`
  }
  return null
}

export function commandForPress(
  press: KeyPress,
  focus: Focus,
  bindings: readonly Binding[],
  apple: boolean,
): CommandId | null {
  if (press.getModifierState("AltGraph")) return null
  for (const binding of bindings.toReversed()) {
    const chord = parseChord(binding.key)
    if (chord !== null && (WHEN[binding.command]?.(focus) ?? true) && pressMatches(press, chord, apple)) return binding.command
  }
  return null
}

export function isDefault(command: CommandId, binding: string): boolean {
  const defaults: readonly string[] = COMMANDS.find((entry) => entry.command === command)?.defaults ?? []
  const [only] = defaults
  return defaults.length === 1 && only !== undefined && normalize(only) === binding
}

const isCommand = (value: string): value is CommandId => LABELS.has(value)

export function parseOverrides(value: unknown): Overrides {
  if (typeof value !== "object" || value === null) return {}
  const overrides: Overrides = {}
  for (const [command, keys] of Object.entries(value)) {
    if (!isCommand(command)) continue
    if (keys === null) overrides[command] = null
    else if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) overrides[command] = keys
  }
  return overrides
}
