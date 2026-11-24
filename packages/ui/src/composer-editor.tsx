import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin"
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical"
import { type ReactNode, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { type Command, CommandMenuSurface, type CommandRow, commandRowId } from "./chat/command-menu"
import { cn } from "./cn"
import { rank } from "./fuzzy"

export interface ComposerHandle {
  readonly focus: () => void
  readonly clear: () => void
  readonly submit: () => void
}

interface Trigger {
  readonly start: number
  readonly command: string | null
  readonly term: string
}

interface Open {
  readonly trigger: Trigger
  readonly anchorKey: string
  readonly rect: { readonly left: number; readonly top: number; readonly bottom: number }
}

const TRIGGER = /(?:^|[\s([{])\/(?:([a-z-]+):)?([^\s/:]*)$/
const GAP = 6
const INSET = 8
const FLOOR = 240
const MENU = { width: 320, maxHeight: 320 }
const LIMIT = 15
const INLINE = 6

const length = (trigger: Trigger) => 1 + (trigger.command === null ? 0 : trigger.command.length + 1) + trigger.term.length
const triggerKey = (trigger: Trigger) => `${trigger.start}:${trigger.command ?? ""}`

export const detectTrigger = (before: string, pickers: readonly string[]): Trigger | null => {
  const match = TRIGGER.exec(before)
  if (!match) return null
  const command = match[1] ?? null
  const term = match[2] ?? ""
  if (command !== null && !pickers.includes(command)) return null
  const trigger = { start: 0, command, term }
  return { ...trigger, start: before.length - length(trigger) }
}

export const typedCommand = (text: string, commands: readonly Command[]) => {
  const name = /^\/([a-z-]+)$/.exec(text.trim())?.[1]
  if (name === undefined) return undefined
  const found = commands.find((command) => command.kind !== "insert" && (command.name === name || command.aliases?.includes(name) === true))
  if (found === undefined || found.kind === "insert") return undefined
  return { name: found.name, run: found.run }
}

const place = (rect: Open["rect"], root: HTMLElement | null) => {
  const view = { width: window.innerWidth, height: window.innerHeight }
  const bounds = root?.closest('[data-slot="sidebar-panel"]')?.getBoundingClientRect()
  const top = Math.max(bounds?.top ?? 0, 0) + INSET
  const bottom = Math.min(bounds?.bottom ?? view.height, view.height) - INSET
  const left = Math.max(12, Math.min(rect.left, view.width - MENU.width - 12))
  const below = bottom - rect.bottom - GAP
  const above = rect.top - GAP - top
  const under = below >= MENU.maxHeight || below > above
  const maxHeight = Math.max(Math.min(FLOOR, MENU.maxHeight), Math.min(MENU.maxHeight, under ? below : above))
  return under ? { left, top: rect.bottom + GAP, bottom: undefined, maxHeight } : { left, top: undefined, bottom: view.height - rect.top + GAP, maxHeight }
}

const $reset = () => {
  const paragraph = $createParagraphNode()
  $getRoot().clear().append(paragraph)
  if ($getSelection() !== null) paragraph.select()
}

function CommandPlugin({ commands }: { commands: readonly Command[] }) {
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState<Open | null>(null)
  const [wanted, setWanted] = useState({ scope: "", index: 0 })
  const dismissed = useRef<string | null>(null)
  const pickers = useMemo(() => commands.flatMap((command) => (command.kind === "picker" ? [command] : [])), [commands])
  const names = useMemo(() => pickers.flatMap((command) => [command.name, ...(command.aliases ?? [])]), [pickers])

  useEffect(
    () =>
      editor.registerUpdateListener(() => {
        const found = editor.getEditorState().read(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== "text") return null
          const node = selection.anchor.getNode()
          if (!$isTextNode(node)) return null
          const trigger = detectTrigger(node.getTextContent().slice(0, selection.anchor.offset), names)
          return trigger ? { trigger, anchorKey: node.getKey() } : null
        })
        if (!found) {
          dismissed.current = null
          setOpen(null)
          return
        }
        if (dismissed.current === triggerKey(found.trigger)) return
        const selection = window.getSelection()
        const rect = (selection?.rangeCount ? selection.getRangeAt(0) : null)?.getBoundingClientRect()
        if (rect) setOpen({ ...found, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } })
      }),
    [editor, names],
  )

  const name = open?.trigger.command ?? null
  const picker = name === null ? undefined : pickers.find((command) => command.name === name || command.aliases?.includes(name) === true)
  const term = open?.trigger.term.trim().toLowerCase() ?? ""

  const { rows, headers } = useMemo((): { rows: readonly CommandRow[]; headers: ReadonlyMap<number, string> } => {
    const none = new Map<number, string>()
    if (open === null) return { rows: [], headers: none }
    if (picker === undefined) {
      const found = rank(commands, (command) => [command.name, command.label, ...(command.aliases ?? []), ...(command.searchTerms ?? [])], term, 2)
      const top = found.map((command): CommandRow => ({ type: "command", command }))
      if (term === "") return { rows: top, headers: none }
      const inline = pickers
        .filter((command) => command.inline === true)
        .map((command) => ({
          command,
          items: rank(command.items, (item) => [item.label, item.id, ...(item.searchTerms ?? [])], term, 2).slice(0, INLINE),
        }))
        .filter((group) => group.items.length > 0)
      const marks = new Map<number, string>()
      const rows = inline.reduce((all, group) => {
        marks.set(all.length, group.command.label)
        return [...all, ...group.items.map((item): CommandRow => ({ type: "item", command: group.command, item }))]
      }, top)
      return { rows, headers: marks }
    }
    const grouped = term === "" && picker.items.some((item) => item.group !== undefined)
    const items = grouped ? picker.items : rank(picker.items, (item) => [item.label, item.id, ...(item.searchTerms ?? [])], term, 2).slice(0, LIMIT)
    return {
      rows: [{ type: "back" }, ...items.map((item): CommandRow => ({ type: "item", command: picker, item }))],
      headers: new Map(grouped ? items.flatMap((item, at): Array<[number, string]> => (item.group !== undefined && item.group !== items[at - 1]?.group ? [[at + 1, item.group]] : [])) : []),
    }
  }, [commands, pickers, open, picker, term])

  const empty = rows.some((row) => row.type !== "back") || open === null ? null : picker === undefined ? "No commands found" : picker.emptyLabel
  const loading = picker?.loading === true
  const scope = `${open?.trigger.command ?? ""}:${open?.trigger.term ?? ""}`
  const first = rows[0]?.type === "back" && rows.length > 1 ? 1 : 0
  const highlight = Math.min(wanted.scope === scope ? wanted.index : first, Math.max(rows.length - 1, 0))
  const move = useCallback((index: number) => setWanted({ scope, index }), [scope])

  const dismiss = useCallback(
    (remember: boolean) => {
      if (remember && open) dismissed.current = triggerKey(open.trigger)
      setOpen(null)
    },
    [open],
  )
  const latestDismiss = useRef(dismiss)
  latestDismiss.current = dismiss

  const replace = useCallback(
    (text: string, after?: () => void) => {
      if (!open) return
      const { trigger, anchorKey } = open
      editor.update(() => {
        const node = $getNodeByKey(anchorKey)
        if ($isTextNode(node)) node.select(trigger.start, trigger.start + length(trigger)).insertText(text)
      })
      after?.()
    },
    [editor, open],
  )

  const select = useCallback(
    (row: CommandRow, direct = false) => {
      if (row.type === "back") return replace("/")
      if (row.type === "item") {
        const { insert } = row.item
        if (insert === undefined) replace("", () => row.command.select(row.item))
        else if (open) {
          const { trigger, anchorKey } = open
          editor.update(() => {
            const node = $getNodeByKey(anchorKey)
            if ($isTextNode(node)) node.select(trigger.start, trigger.start + length(trigger)).insertNodes([$createTextNode(insert).setMode("token"), $createTextNode(" ")])
          })
        }
        return setOpen(null)
      }
      const { command } = row
      if (command.kind === "picker") {
        if (!direct || command.run === undefined) return replace(`/${command.name}:`)
        replace("", command.run)
      } else if (command.kind === "insert") replace(command.text)
      else replace("", command.run)
      setOpen(null)
    },
    [editor, open, replace],
  )

  const shown = open !== null && (rows.length > 0 || empty !== null || loading)

  useEffect(() => {
    if (!shown) return
    const step = (delta: number) => {
      move(rows.length === 0 ? 0 : (highlight + delta + rows.length) % rows.length)
      return true
    }
    const choose = (direct: boolean) => {
      const row = rows[highlight]
      if (row) select(row, direct)
      return row !== undefined
    }
    const top = open?.trigger.command === null
    const unregister = [
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (event) => (event?.preventDefault(), step(1)), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, (event) => (event?.preventDefault(), step(-1)), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const done = choose(true)
          if (done) event?.preventDefault()
          return done
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const done = choose(false)
          if (done) event?.preventDefault()
          return done
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event?.preventDefault()
          event?.stopPropagation()
          if (top) dismiss(true)
          else replace("/")
          return true
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!open || top || open.trigger.term !== "") return false
          event?.preventDefault()
          replace("/")
          return true
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          requestAnimationFrame(() => {
            if (editor.getRootElement()?.contains(document.activeElement) !== true) latestDismiss.current(true)
          })
          return false
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    ]
    return () => unregister.forEach((off) => off())
  }, [editor, shown, rows, highlight, move, select, dismiss, replace, open])

  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return
    const close = () => {
      if (root.getAttribute("aria-activedescendant")?.startsWith("tock-command-row-") !== true) return
      root.removeAttribute("aria-activedescendant")
      root.setAttribute("aria-expanded", "false")
    }
    if (shown) {
      root.setAttribute("aria-expanded", "true")
      root.setAttribute("aria-activedescendant", commandRowId(highlight))
    } else close()
    return close
  }, [editor, shown, highlight])

  const active = useRef<HTMLDivElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  if (!shown || !open) return null
  const at = place(open.rect, editor.getRootElement())
  return createPortal(
    <div data-slot="composer-command-menu" className="fixed z-(--z-overlay-content) outline-none" style={{ left: at.left, top: at.top, bottom: at.bottom }}>
      <CommandMenuSurface
        rows={rows}
        command={picker?.name ?? null}
        loading={loading}
        empty={empty}
        highlight={highlight}
        headers={headers}
        onSelect={select}
        onHighlight={move}
        highlightedRef={active}
        maxHeight={at.maxHeight}
      />
    </div>,
    document.body,
  )
}

const text = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent())
const touchOnly = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches

function Behavior({
  handle,
  commands,
  onSubmit,
  onFiles,
}: {
  handle?: Ref<ComposerHandle>
  commands: readonly Command[]
  onSubmit: (text: string) => boolean | void
  onFiles?: (files: File[]) => void
}) {
  const [editor] = useLexicalComposerContext()
  const latest = useRef({ commands, onSubmit, onFiles })
  latest.current = { commands, onSubmit, onFiles }

  const submit = useCallback(() => {
    const value = text(editor)
    const typed = typedCommand(value, latest.current.commands)
    if (typed?.run !== undefined) {
      editor.update($reset)
      typed.run()
    } else if (typed !== undefined) {
      editor.update(() => {
        const paragraph = $createParagraphNode().append($createTextNode(`/${typed.name}:`))
        $getRoot().clear().append(paragraph)
        paragraph.selectEnd()
      })
      editor.focus()
    } else if (latest.current.onSubmit(value) !== false) editor.update($reset)
  }, [editor])

  useImperativeHandle(handle, () => ({ focus: () => editor.focus(), clear: () => editor.update($reset), submit }), [editor, submit])

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event === null || event.isComposing || event.keyCode === 229 || event.shiftKey || touchOnly()) return false
          event.preventDefault()
          submit()
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, submit],
  )

  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const files = event instanceof ClipboardEvent ? Array.from(event.clipboardData?.files ?? []) : []
          if (files.length === 0 || latest.current.onFiles === undefined) return false
          event.preventDefault()
          latest.current.onFiles(files)
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  )

  return null
}

const EDITOR =
  "max-h-56 min-h-16 w-full overflow-y-auto overscroll-contain p-1 text-base font-normal text-foreground outline-none md:scroll-fade-y md:supports-[animation-timeline:scroll()]:scrollbar-hide"

export function ComposerEditor({
  ref,
  placeholder,
  autoFocus = false,
  commands = [],
  className,
  onSubmit,
  onEmptyChange,
  onFiles,
}: {
  ref?: Ref<ComposerHandle>
  placeholder: ReactNode
  autoFocus?: boolean
  commands?: readonly Command[]
  className?: string
  onSubmit: (text: string) => boolean | void
  onEmptyChange?: (empty: boolean) => void
  onFiles?: (files: File[]) => void
}) {
  const [blank, setBlank] = useState(true)
  const known = useRef(true)
  return (
    <LexicalComposer initialConfig={{ namespace: "tock-composer", theme: { paragraph: "" }, onError: (error) => console.error(error) }}>
      <div>
        <div className="relative">
          <PlainTextPlugin
            contentEditable={<ContentEditable aria-label="Message" className={cn(EDITOR, "whitespace-pre-wrap [overflow-wrap:anywhere]", className)} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          {blank ? (
            <div aria-hidden className="pointer-events-none absolute top-1 left-1 text-base font-normal text-muted-foreground-3">
              {placeholder}
            </div>
          ) : null}
          <HistoryPlugin />
          {commands.length > 0 ? <CommandPlugin commands={commands} /> : null}
          {autoFocus ? <AutoFocusPlugin /> : null}
          <OnChangePlugin
            ignoreSelectionChange
            onChange={(state) => {
              const { raw, empty } = state.read(() => {
                const content = $getRoot().getTextContent()
                return { raw: content === "", empty: content.trim().length === 0 }
              })
              setBlank(raw)
              if (empty === known.current) return
              known.current = empty
              onEmptyChange?.(empty)
            }}
          />
          <Behavior handle={ref} commands={commands} onSubmit={onSubmit} onFiles={onFiles} />
        </div>
      </div>
    </LexicalComposer>
  )
}
