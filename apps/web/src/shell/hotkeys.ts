import { defineAppHotkeys, formatForDisplay } from "@tanstack/solid-hotkeys"

/**
 * Every keyboard shortcut in Tock, declared once. Components bind them with createHotkey(appHotkeys[id], …) and the
 * shortcuts sheet renders `sheet` from the same declarations, with each row's live registration status, so the sheet
 * and the bindings cannot drift. Keys follow GUIDE §5 and px2 keys(); browsers keep ⌘N for a new window and ⌘↑↓ for
 * scrolling, so New chat and Previous or next chat take ⌥.
 */
export const appHotkeys = defineAppHotkeys({
  "chats.search": { hotkey: "Mod+K", meta: { name: "Search chats" }, options: { ignoreInputs: false } },
  "chats.new": { hotkey: "Alt+N", meta: { name: "New chat" }, options: { ignoreInputs: false } },
  "chats.previous": { hotkey: "Alt+ArrowUp", meta: { name: "Previous chat" }, options: { ignoreInputs: false } },
  "chats.next": { hotkey: "Alt+ArrowDown", meta: { name: "Next chat" }, options: { ignoreInputs: false } },
  "chat.rename": { hotkey: "Enter", meta: { name: "Rename the chat" }, options: { ignoreInputs: false, preventDefault: false, stopPropagation: false } },
  "chat.archive": { hotkey: "Mod+E", meta: { name: "Archive" }, options: { ignoreInputs: false, preventDefault: false } },
  "chat.unread": { hotkey: "Mod+U", meta: { name: "Mark as unread" }, options: { ignoreInputs: false, preventDefault: false } },
  "chat.peek": { hotkey: "Space", meta: { name: "Peek at a chat" }, options: { ignoreInputs: false, preventDefault: false, stopPropagation: false } },
  "composer.attach": { hotkey: "Mod+O", meta: { name: "Attach files" }, options: { ignoreInputs: false } },
  "toast.undo": { hotkey: "Mod+Z", meta: { name: "Undo the last change" }, options: { preventDefault: false, stopPropagation: false } },
  "layer.escape": { hotkey: "Escape", meta: { name: "Stop toast" }, options: { ignoreInputs: false, preventDefault: false, stopPropagation: false } },
  "sidebar.toggle": { hotkey: "Mod+B", meta: { name: "Show or hide the sidebar" }, options: { ignoreInputs: false } },
  "help.shortcuts": { hotkey: "?", meta: { name: "Keyboard shortcuts" }, options: { preventDefault: false, stopPropagation: false } },
})

export type HotkeyId = keyof typeof appHotkeys

/** The sheet, in px2 keys() order: one row per action, several ids when one row names a pair (↑ ↓). */
export const sheet: readonly { label: string; ids: readonly HotkeyId[] }[] = [
  { label: "Search chats", ids: ["chats.search"] },
  { label: "New chat", ids: ["chats.new"] },
  { label: "Previous or next chat", ids: ["chats.previous", "chats.next"] },
  { label: "Rename the chat", ids: ["chat.rename"] },
  { label: "Archive", ids: ["chat.archive"] },
  { label: "Mark as unread", ids: ["chat.unread"] },
  { label: "Peek at a chat", ids: ["chat.peek"] },
  { label: "Attach files", ids: ["composer.attach"] },
  { label: "Undo the last change", ids: ["toast.undo"] },
  { label: "Stop toast", ids: ["layer.escape"] },
  { label: "Keyboard shortcuts", ids: ["help.shortcuts"] },
]

const caps: Record<string, string> = { Esc: "esc", "␣": "Space" }

/** Key caps for a row: the shared modifiers once, then each id's own key (⌥ ↑ ↓). */
export function keysFor(ids: readonly HotkeyId[]): string[] {
  const parts = ids.map((id) => formatForDisplay(appHotkeys[id].defaultHotkey, { parts: true }))
  const keys = [...parts[0]!, ...parts.slice(1).map((part) => part[part.length - 1]!)]
  return keys.map((key) => caps[key] ?? key)
}

export const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, [contenteditable=true], .ProseMirror") !== null)
