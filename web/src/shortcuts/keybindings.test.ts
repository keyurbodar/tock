import { describe, expect, it } from "vitest"
import {
  bindingConflict,
  bindingFromPress,
  bindingLabel,
  bindingParts,
  commandForPress,
  isDefault,
  normalize,
  parseOverrides,
  resolveBindings,
  type Focus,
  type KeyPress,
} from "./keybindings"

const press = (key: string, code: string, modifiers: Partial<KeyPress> = {}, altGraph = false): KeyPress => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  getModifierState: () => altGraph,
  ...modifiers,
})

const idle: Focus = { editable: false, overlay: false, composer: false }
const defaults = resolveBindings({})

describe("normalize", () => {
  it("orders modifiers and names space and plus", () => {
    expect(normalize("Shift + Mod+K")).toBe("mod+shift+k")
    expect(normalize("alt+space")).toBe("alt+space")
    expect(normalize("mod+plus")).toBe("mod+plus")
  })

  it("rejects sequences and bindings without exactly one key", () => {
    expect(normalize("mod+k mod+b")).toBeNull()
    expect(normalize("mod+shift")).toBeNull()
    expect(normalize("mod+k+b")).toBeNull()
  })
})

describe("bindingFromPress", () => {
  it("maps the platform command key to mod", () => {
    expect(bindingFromPress(press("k", "KeyK", { ctrlKey: true }), false)).toBe("mod+k")
    expect(bindingFromPress(press("k", "KeyK", { metaKey: true }), true)).toBe("mod+k")
    expect(bindingFromPress(press("k", "KeyK", { ctrlKey: true }), true)).toBe("ctrl+k")
    expect(bindingFromPress(press("k", "KeyK", { metaKey: true }), false)).toBe("meta+k")
  })

  it("ignores bare modifiers and AltGraph", () => {
    expect(bindingFromPress(press("Shift", "ShiftLeft", { shiftKey: true }), false)).toBeNull()
    expect(bindingFromPress(press("@", "KeyQ", { ctrlKey: true, altKey: true }, true), false)).toBeNull()
  })

  it("reads shifted punctuation and option-composed letters from the physical key", () => {
    expect(bindingFromPress(press("?", "Slash", { ctrlKey: true, shiftKey: true }), false)).toBe("mod+shift+/")
    expect(bindingFromPress(press("µ", "KeyM", { altKey: true }), true)).toBe("alt+m")
    expect(bindingFromPress(press("Dead", "KeyN", { altKey: true }), true)).toBe("alt+n")
  })
})

describe("commandForPress", () => {
  it("finds the command bound to a press", () => {
    expect(commandForPress(press("k", "KeyK", { ctrlKey: true }), idle, defaults, false)).toBe("commandMenu.toggle")
    expect(commandForPress(press("O", "KeyO", { ctrlKey: true, shiftKey: true }), idle, defaults, false)).toBe("thread.new")
    expect(commandForPress(press("k", "KeyK"), idle, defaults, false)).toBeNull()
    expect(commandForPress(press("k", "KeyK", { ctrlKey: true, altKey: true }), idle, defaults, false)).toBeNull()
  })

  it("holds thread commands back while another field or an overlay has focus", () => {
    const slash = press("/", "Slash", { ctrlKey: true })
    expect(commandForPress(slash, idle, defaults, false)).toBe("composer.attach")
    expect(commandForPress(slash, { editable: true, overlay: false, composer: false }, defaults, false)).toBeNull()
    expect(commandForPress(slash, { editable: false, overlay: true, composer: false }, defaults, false)).toBeNull()
    expect(commandForPress(slash, { editable: true, overlay: true, composer: true }, defaults, false)).toBe("composer.attach")
  })

  it("focuses the composer only from outside it", () => {
    const key = press("i", "KeyI", { ctrlKey: true })
    expect(commandForPress(key, idle, defaults, false)).toBe("composer.focus")
    expect(commandForPress(key, { editable: true, overlay: false, composer: true }, defaults, false)).toBeNull()
  })

  it("follows overrides", () => {
    const bindings = resolveBindings({ "commandMenu.toggle": ["mod+j"], "sidebar.toggle": null })
    expect(commandForPress(press("j", "KeyJ", { ctrlKey: true }), idle, bindings, false)).toBe("commandMenu.toggle")
    expect(commandForPress(press("k", "KeyK", { ctrlKey: true }), idle, bindings, false)).toBeNull()
    expect(commandForPress(press("b", "KeyB", { ctrlKey: true }), idle, bindings, false)).toBeNull()
  })
})

describe("bindingConflict", () => {
  it("names the command that already owns the binding", () => {
    expect(bindingConflict("mod+b", "commandMenu.toggle", defaults, false)).toBe("mod+b conflicts with Toggle sidebar")
    expect(bindingConflict("mod+k", "commandMenu.toggle", defaults, false)).toBeNull()
  })

  it("treats mod and the platform key as the same binding", () => {
    expect(bindingConflict("ctrl+b", "commandMenu.toggle", defaults, false)).toBe("ctrl+b conflicts with Toggle sidebar")
    expect(bindingConflict("ctrl+b", "commandMenu.toggle", defaults, true)).toBeNull()
  })

  it("rejects browser shortcuts and bindings without a modifier", () => {
    expect(bindingConflict("mod+t", "thread.new", defaults, false)).toBe("mod+t is reserved by the browser")
    expect(bindingConflict("k", "thread.new", defaults, false)).toBe("k needs a modifier key")
    expect(bindingConflict("shift+k", "thread.new", defaults, false)).toBe("shift+k needs a modifier key")
  })

  it("allows a binding held by a command that only runs in one place", () => {
    expect(bindingConflict("mod+/", "sidebar.toggle", defaults, false)).toBeNull()
  })
})

describe("display", () => {
  it("splits a binding into key caps per platform", () => {
    expect(bindingParts("mod+shift+o", false)).toEqual(["Ctrl", "Shift", "O"])
    expect(bindingParts("mod+shift+o", true)).toEqual(["⇧", "⌘", "O"])
    expect(bindingParts("alt+space", false)).toEqual(["Alt", "Space"])
    expect(bindingLabel("mod+/", false)).toBe("Ctrl+/")
    expect(bindingLabel("mod+/", true)).toBe("⌘/")
  })
})

describe("overrides", () => {
  it("keeps only known commands with string lists or null", () => {
    expect(parseOverrides({ "sidebar.toggle": null, "thread.new": ["mod+j"], unknown: ["mod+x"], "settings.open": 3 })).toEqual({
      "sidebar.toggle": null,
      "thread.new": ["mod+j"],
    })
    expect(parseOverrides("nope")).toEqual({})
  })

  it("drops stored bindings that are no longer valid", () => {
    expect(resolveBindings({ "thread.new": ["mod+t", "k", "mod+j"] }).filter((entry) => entry.command === "thread.new")).toEqual([
      { key: "mod+j", command: "thread.new" },
    ])
  })

  it("recognises a command's single default", () => {
    expect(isDefault("commandMenu.toggle", "mod+k")).toBe(true)
    expect(isDefault("commandMenu.toggle", "mod+j")).toBe(false)
  })
})
