import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { Menu, MenuContent, MenuItem, MenuItemIcon, MenuTrigger } from "@ui-sdk/solid/menu"
import { Editor, type JSONContent } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import HardBreak from "@tiptap/extension-hard-break"
import { Placeholder, UndoRedo } from "@tiptap/extensions"
import { EditorState } from "@tiptap/pm/state"
import { Icon } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Swap } from "@tock/ui/swap"
import { tokens } from "@tock/tokens"
import { idb } from "../lib/idb"
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

const drafts = new Map<string, JSONContent>()
const typing = (e: KeyboardEvent) => e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
const editable = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)

export function Composer(props: { draftKey: string; working: boolean; attachments: Attachments; onSend: (text: string) => void; onStop: () => void }) {
  const [empty, setEmpty] = createSignal(true)
  const [plusOpen, setPlusOpen] = createSignal(false)
  let picker!: HTMLInputElement
  const blank = () => empty() && props.attachments.items().length === 0
  const blocked = () => !props.attachments.ready()
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

  const load = (content: JSONContent | undefined) => {
    if (!editor) return
    const doc = content ? editor.schema.nodeFromJSON(content) : editor.schema.topNodeType.createAndFill()!
    editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }))
    setEmpty(editor.isEmpty)
  }

  const submit = () => {
    if (!editor) return
    if (stop()) return props.onStop()
    const text = editor.getText({ blockSeparator: "\n" }).trim()
    if ((!text && props.attachments.items().length === 0) || blocked()) return
    props.onSend(withFiles(text, props.attachments.files()))
    props.attachments.clear()
    load(undefined)
    save(key)
    editor.view.focus()
  }

  const mount = (element: HTMLDivElement) => {
    editor = new Editor({
      element,
      autofocus: matchMedia("(pointer: fine)").matches ? "end" : false,
      extensions: [Document, Paragraph, Text, HardBreak, UndoRedo, Placeholder.configure({ placeholder: "Message toast" })],
      editorProps: {
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])]
          if (files.length === 0) return false
          props.attachments.add(files)
          return true
        },
        attributes: { class: "tds-input", role: "textbox", "aria-multiline": "true", "aria-label": "Message toast" },
        handleKeyDown: (_view, event) => {
          if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return false
          event.preventDefault()
          submit()
          return true
        },
      },
      onUpdate: ({ editor: next }) => {
        setEmpty(next.isEmpty)
        clearTimeout(saveTimer)
        const forKey = key
        saveTimer = setTimeout(() => save(forKey), tokens.motion.duration["draft-save"])
      },
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

  const plus = async (action: string) => {
    if (action === "files") return picker.click()
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const type = item.types.find((entry) => entry !== "text/plain" && entry !== "text/html")
        if (type) files.push(new File([await item.getType(type)], `pasted.${type.split("/")[1] ?? "bin"}`, { type }))
        else if (item.types.includes("text/plain")) editor?.commands.insertContent(await (await item.getType("text/plain")).text())
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

  return (
    <div class="tds-composer-wrap">
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
        <div class="tds-field" data-tall={height() > tokens.size.composer || props.attachments.items().length > 0 ? "" : undefined} style={{ height: `${height() + (props.attachments.items().length > 0 ? tokens.size["attach-tray"] : 0)}px` }}>
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
        <button type="submit" class="tds-press tds-send" data-empty={(blank() || blocked()) && !stop() ? "" : undefined} data-stop={stop() ? "" : undefined} aria-label={stop() ? "Stop" : "Send"}>
          <Swap on={stop()} a={<MorphIcon name="arrow-up" class="tds-optical-up" weight={tokens.icon["stroke-send"]} />} b={<Icon name="stop:fill" size="toast" />} />
        </button>
      </form>
    </div>
  )
}
