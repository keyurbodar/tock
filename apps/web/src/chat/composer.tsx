import { TextMorph } from "@tock/ui/text-morph"
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Menu, MenuContent, MenuItem, MenuItemIcon, MenuTrigger } from "@ui-sdk/solid/menu"
import { Editor, type JSONContent } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import HardBreak from "@tiptap/extension-hard-break"
import { Placeholder, UndoRedo } from "@tiptap/extensions"
import { EditorState } from "@tiptap/pm/state"
import { Icon, type IconName } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Swap } from "@tock/ui/swap"
import { tokens } from "@tock/tokens"
import { idb } from "../lib/idb"
import { app, newThreadId, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { toast } from "../shell/toasts"
import { setShortcutsOpen } from "../shell/shortcuts"
import { linkTyped, selectTokenBefore, Token, triggerAt, type TokenAttrs, type Trigger } from "./tokens"
import { extension, formatSize, withFiles, type Attachment, type createAttachments } from "./attachments"

type Attachments = ReturnType<typeof createAttachments>

function Chip(props: { item: Attachment; onRemove: () => void; onRetry: () => void }) {
  const ring = () => `${Math.round(props.item.progress * 100)} 100`
  return (
    <div class="tds-attach" data-kind={props.item.preview ? "image" : "doc"} data-status={props.item.status}>
      <Show
        when={props.item.preview}
        fallback={
          <>
            <span class="tds-attach-glyph">
              <Icon name="file-text" size="menu" />
              <b>{extension(props.item.name)}</b>
            </span>
            <span class="tds-attach-meta">
              <b>{props.item.name}</b>
              <span>
                <Show when={props.item.status === "failed"} fallback={props.item.status === "uploading" ? `${Math.round(props.item.progress * 100)}% of ${formatSize(props.item.size)}` : formatSize(props.item.size)}>
                  {props.item.error}
                  <button type="button" class="tds-attach-retry" onClick={props.onRetry}>
                    Retry
                  </button>
                </Show>
              </span>
            </span>
          </>
        }
      >
        {(src) => <img src={src()} alt={props.item.name} draggable={false} />}
      </Show>
      <Show when={props.item.status === "uploading"}>
        <svg class="tds-attach-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9" pathLength="100" />
          <circle cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray={ring()} />
        </svg>
      </Show>
      <button type="button" class="tds-attach-remove tds-press" aria-label={`Remove ${props.item.name}`} onClick={props.onRemove}>
        <Icon name="x" size="chip" />
      </button>
    </div>
  )
}

interface Suggestion {
  readonly key: string
  readonly label: string
  readonly hint: string
  readonly icon: IconName
  readonly hue?: string
  readonly run: () => void
}

const commands = [
  { key: "new", label: "new", hint: "Start a new chat", icon: "note-pencil" },
  { key: "files", label: "files", hint: "Add photos and files", icon: "paperclip" },
  { key: "paste", label: "paste", hint: "Paste from clipboard", icon: "clipboard-text" },
  { key: "shortcuts", label: "shortcuts", hint: "Keyboard shortcuts", icon: "keyboard" },
] as const

const drafts = new Map<string, JSONContent>()
const typing = (e: KeyboardEvent) => e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
const editable = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)

export function Composer(props: { draftKey: string; working: boolean; attachments: Attachments; onSend: (text: string) => void; onStop: () => void }) {
  const navigate = useNavigate()
  const [empty, setEmpty] = createSignal(true)
  const [length, setLength] = createSignal(0)
  const [plusOpen, setPlusOpen] = createSignal(false)
  const [held, setHeld] = createSignal(false)
  const [trigger, setTrigger] = createSignal<Trigger | null>(null)
  const [active, setActive] = createSignal(0)
  const [caret, setCaret] = createSignal({ left: 0, bottom: 0 })
  let picker!: HTMLInputElement
  const blank = () => empty() && props.attachments.items().length === 0
  const pending = () => props.attachments.items().filter((item) => item.status === "uploading")
  const failed = () => props.attachments.items().filter((item) => item.status === "failed")
  const tooLong = () => length() > tokens.limit["prompt-chars"]
  const [height, setHeight] = createSignal<number>(tokens.size.composer)
  let editor: Editor | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let key = ""
  let teardown = () => {}
  const stop = () => props.working && blank()

  const save = (forKey: string) => {
    clearTimeout(saveTimer)
    if (!editor || !forKey) return
    if (editor.isEmpty) {
      drafts.delete(forKey)
      void idb.del("drafts", forKey)
    } else {
      const json = editor.getJSON()
      drafts.set(forKey, json)
      void idb.put("drafts", forKey, json)
    }
  }

  const sync = () => {
    if (!editor) return
    setEmpty(editor.isEmpty)
    setLength(editor.getText().length)
  }

  const load = (content: JSONContent | undefined) => {
    if (!editor) return
    const doc = content ? editor.schema.nodeFromJSON(content) : editor.schema.topNodeType.createAndFill()!
    editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }))
    setTrigger(null)
    sync()
  }

  const text = () => editor?.getText({ blockSeparator: "\n" }).trim() ?? ""

  /** T3Code's held send: a send while files upload waits for them, then goes on its own; editing or Esc cancels it. */
  const submit = () => {
    if (!editor) return
    if (stop()) return props.onStop()
    if ((!text() && props.attachments.items().length === 0) || tooLong()) return
    const broken = untrack(failed)
    if (broken.length > 0) {
      toast(broken.length > 1 ? `Fix or remove ${broken.length} files` : `Fix or remove ${broken[0]!.name}`, { description: "Then send again", tone: "failed", icon: "warning-circle", duration: tokens.motion.toast.error })
      return
    }
    const waiting = untrack(pending)
    if (waiting.length > 0) {
      setHeld(true)
      return
    }
    setHeld(false)
    props.onSend(withFiles(text(), props.attachments.files()))
    props.attachments.clear()
    load(undefined)
    save(key)
    editor.view.focus()
  }

  createEffect(
    () => held() && pending().length === 0,
    (ready) => {
      if (ready) submit()
    },
  )

  const suggestions = createMemo<Suggestion[]>(() => {
    const current = trigger()
    if (!current) return []
    const query = current.query.toLowerCase()
    if (current.char === "/")
      return commands
        .filter((command) => command.label.startsWith(query))
        .map((command) => ({ key: command.key, label: `/${command.label}`, hint: command.hint, icon: command.icon, run: () => runCommand(command.key) }))
    return app.sessions
      .filter((session) => session.id !== props.draftKey && !session.meta.archived && titleOf(session).toLowerCase().includes(query))
      .slice(0, tokens.limit["mention-results"])
      .map((session) => ({
        key: session.id,
        label: titleOf(session),
        hint: session.busy ? "Working" : `${session.messageCount} messages`,
        icon: glyphFor(session.id).icon,
        hue: glyphFor(session.id).hue,
        run: () => insertToken({ kind: "thread", id: session.id, label: titleOf(session) }),
      }))
  })

  const clearTrigger = () => {
    const current = trigger()
    if (!editor || !current) return
    editor.view.dispatch(editor.state.tr.delete(current.from, current.to))
    setTrigger(null)
  }

  const insertToken = (attrs: TokenAttrs) => {
    const current = trigger()
    if (!editor || !current) return
    editor.chain().focus().insertContentAt({ from: current.from, to: current.to }, [{ type: "token", attrs }, { type: "text", text: " " }]).run()
    setTrigger(null)
  }

  function runCommand(command: string) {
    clearTrigger()
    if (command === "new") navigate(`/t/${newThreadId()}`)
    if (command === "files") picker.click()
    if (command === "paste") void plus("clipboard")
    if (command === "shortcuts") setShortcutsOpen(true)
  }

  const watchTrigger = () => {
    if (!editor) return
    const next = triggerAt(editor.view)
    const before = untrack(trigger)
    if (!next || before?.from !== next.from || before.query !== next.query) setActive(0)
    setTrigger(next)
    if (!next) return
    const at = editor.view.coordsAtPos(next.from)
    const host = editor.view.dom.closest(".tds-composer-wrap")!.getBoundingClientRect()
    setCaret({ left: at.left - host.left, bottom: host.bottom - at.top + tokens.size["menu-offset"] })
  }

  const longPaste = (value: string) => {
    if (value.split("\n").length <= tokens.limit["paste-lines"]) return false
    props.attachments.add([new File([value], "pasted.txt", { type: "text/plain" })])
    toast("Long text became a file", { description: `${value.split("\n").length} lines, so your message stays readable`, tone: "mono", icon: "text-align-left" })
    return true
  }

  const mount = (element: HTMLDivElement) => {
    editor = new Editor({
      element,
      autofocus: matchMedia("(pointer: fine)").matches ? "end" : false,
      extensions: [Document, Paragraph, Text, HardBreak, Token, UndoRedo, Placeholder.configure({ placeholder: "Message toast" })],
      editorProps: {
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])]
          if (files.length > 0) {
            props.attachments.add(files)
            return true
          }
          return longPaste(event.clipboardData?.getData("text/plain") ?? "")
        },
        attributes: { class: "tds-input", role: "textbox", "aria-multiline": "true", "aria-label": "Message toast" },
        handleKeyDown: (view, event) => {
          const list = untrack(suggestions)
          if (untrack(trigger) && list.length > 0) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              setActive((index) => (index + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length)
              return true
            }
            if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
              event.preventDefault()
              list[untrack(active)]?.run()
              return true
            }
          }
          if (event.key === "Escape") {
            if (untrack(trigger)) return setTrigger(null), true
            if (untrack(held)) return setHeld(false), true
            return false
          }
          if (event.key === "Backspace" && selectTokenBefore(view)) return true
          if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return false
          event.preventDefault()
          submit()
          return true
        },
      },
      onSelectionUpdate: watchTrigger,
      onUpdate: ({ editor: next, transaction }) => {
        if (transaction.docChanged && linkTyped(next.view)) return
        if (untrack(held)) setHeld(false)
        sync()
        watchTrigger()
        clearTimeout(saveTimer)
        const forKey = key
        saveTimer = setTimeout(() => save(forKey), tokens.motion.duration["draft-save"])
      },
      onBlur: () => setTrigger(null),
    })
    const observer = new ResizeObserver(() => setHeight(Math.min(element.scrollHeight, tokens.size["composer-max"])))
    observer.observe(element.firstElementChild ?? element)
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") return event.preventDefault(), picker.click()
      if (!editor || event.defaultPrevented || !typing(event) || editable(document.activeElement)) return
      editor.commands.focus("end")
    }
    document.addEventListener("keydown", onKey)
    teardown = () => {
      observer.disconnect()
      document.removeEventListener("keydown", onKey)
    }
  }

  async function plus(action: string) {
    if (action === "files") return picker.click()
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const type = item.types.find((entry) => entry !== "text/plain" && entry !== "text/html")
        if (type) files.push(new File([await item.getType(type)], `pasted.${type.split("/")[1] ?? "bin"}`, { type }))
        else if (item.types.includes("text/plain")) {
          const value = await (await item.getType("text/plain")).text()
          if (!longPaste(value)) editor?.commands.insertContent(value)
        }
      }
      props.attachments.add(files)
    } catch {
      editor?.commands.insertContent(await navigator.clipboard.readText().catch(() => ""))
    }
    editor?.commands.focus("end")
  }

  onCleanup(() => {
    save(key)
    teardown()
    editor?.destroy()
    editor = undefined
  })

  createEffect(
    () => props.draftKey,
    (next) => {
      if (key) save(key)
      if (key && key !== next) props.attachments.clear()
      setHeld(false)
      key = next
      const cached = drafts.get(next)
      load(cached)
      if (!cached)
        void idb.get<JSONContent>("drafts", next).then((stored) => {
          if (stored && key === next && editor?.isEmpty) {
            drafts.set(next, stored)
            load(stored)
          }
        })
      if (matchMedia("(pointer: fine)").matches) editor?.commands.focus("end")
    },
  )

  const heldLabel = () => {
    const waiting = pending()
    return waiting.length > 1 ? `Sending when ${waiting.length} files finish` : `Sending when ${waiting[0]?.name ?? "the file"} finishes`
  }

  return (
    <div class="tds-composer-wrap">
      <Show when={trigger() && suggestions().length > 0}>
        <div class="tds-menu tds-suggest" role="listbox" aria-label={trigger()?.char === "@" ? "Mention a chat" : "Commands"} style={{ left: `${caret().left}px`, bottom: `${caret().bottom}px` }}>
          <span class="tds-menu-label">{trigger()?.char === "@" ? "Chats" : "Commands"}</span>
          <For each={suggestions()} keyed={(item) => item.key}>
            {(item, index) => (
              <div
                role="option"
                class="tds-menu-item"
                aria-selected={index() === active() ? "true" : "false"}
                data-highlighted={index() === active() ? "" : undefined}
                onPointerMove={() => void setActive(index())}
                onMouseDown={(event) => (event.preventDefault(), item().run())}
              >
                <span class={`tds-menu-icon ${item().hue ?? ""}`}>
                  <Icon name={item().icon} size="menu" />
                </span>
                <span class="tds-suggest-label">{item().label}</span>
                <span class="tds-suggest-hint">{item().hint}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={held() && pending().length > 0}>
        <div class="tds-held" role="status" aria-live="polite">
          <span class="tds-spinner" />
          <b><TextMorph value={heldLabel()} /></b>
          <span>Edit or press Esc to cancel</span>
          <button type="button" class="tds-held-cancel tds-press" onMouseDown={(e) => e.preventDefault()} onClick={() => setHeld(false)}>
            Cancel
          </button>
        </div>
      </Show>
      <Show when={tooLong()}>
        <p class="tds-composer-alert" role="alert">
          <TextMorph value={(length() - tokens.limit["prompt-chars"]).toLocaleString()} /> characters over the limit. Attach long text as a file instead.
        </p>
      </Show>
      <form class="flex items-end gap-8" onSubmit={(e) => (e.preventDefault(), submit())}>
        <input ref={picker} type="file" multiple hidden onChange={(e) => (props.attachments.add([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ""))} />
        <Menu open={plusOpen()} onOpenChange={(next) => setPlusOpen(next)} onAction={(value) => void plus(String(value))}>
          <MenuTrigger class="tds-press tds-composer-plus" aria-label="Add">
            <MorphIcon name={plusOpen() ? "x" : "plus"} />
          </MenuTrigger>
          <MenuContent class="tds-menu" side="top" align="start" sideOffset={tokens.size["menu-offset"]}>
            <MenuItem value="files" class="tds-menu-item">
              <MenuItemIcon class="tds-menu-icon">
                <Icon name="image" size="menu" />
              </MenuItemIcon>
              Photos and Files…
              <span class="tds-menu-keys">
                <kbd class="tds-kbd">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"}</kbd>
                <kbd class="tds-kbd">O</kbd>
              </span>
            </MenuItem>
            <MenuItem value="clipboard" class="tds-menu-item">
              <MenuItemIcon class="tds-menu-icon">
                <Icon name="clipboard-text" size="menu" />
              </MenuItemIcon>
              Paste from Clipboard
            </MenuItem>
          </MenuContent>
        </Menu>
        <div class="tds-field" data-invalid={tooLong() ? "" : undefined} data-tall={height() > tokens.size.composer || props.attachments.items().length > 0 ? "" : undefined} style={{ height: `${height() + (props.attachments.items().length > 0 ? tokens.size["attach-tray"] : 0)}px` }}>
          <Show when={props.attachments.items().length > 0}>
            <div class="tds-attach-tray tds-scroll">
              <For each={props.attachments.items()} keyed={(item) => item.key}>
                {(item) => <Chip item={item()} onRemove={() => props.attachments.remove(item().key)} onRetry={() => props.attachments.retry(item().key)} />}
              </For>
            </div>
          </Show>
          <div class="tds-field-body">
            <div ref={mount} class="tds-editor tds-scroll" onMouseDown={(e) => e.target === e.currentTarget && (e.preventDefault(), editor?.commands.focus("end"))} />
            <button type="button" class="tds-press tds-mic" aria-label="Dictate">
              <Icon name="waveform" size="composer" />
            </button>
          </div>
        </div>
        <button type="submit" class="tds-press tds-send" data-empty={(blank() || tooLong()) && !stop() ? "" : undefined} data-held={held() ? "" : undefined} data-stop={stop() ? "" : undefined} aria-label={stop() ? "Stop" : held() ? "Sending when files finish" : "Send"}>
          <Swap on={stop()} a={<MorphIcon name="arrow-up" class="tds-optical-up" weight={tokens.icon["stroke-send"]} />} b={<Icon name="stop:fill" size="toast" />} />
        </button>
      </form>
    </div>
  )
}
