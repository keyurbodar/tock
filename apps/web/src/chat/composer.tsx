import { TextMorph } from "@tock/ui/text-morph"
import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Menu, MenuContent, MenuItem, MenuItemIcon, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@ui-sdk/solid/menu"
import { Editor, Extension, type JSONContent } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Markdown } from "@tiptap/markdown"
import { Placeholder } from "@tiptap/extensions"
import { EditorState, Plugin, type EditorState as State } from "@tiptap/pm/state"
import { Icon, type IconName } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { tokens } from "@tock/tokens"
import { prefersReducedMotion, animate, drive, recede, scrub, growFrom, watchLayout } from "@tock/ui/motion"
import { idb } from "../lib/idb"
import { app, newThreadId, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { toast } from "../shell/toasts"
import { setShortcutsOpen } from "../shell/shortcuts"
import { linkToken, linkTyped, selectTokenBefore, Token, triggerAt, type TokenAttrs, type Trigger } from "./tokens"
import { extension, formatSize, readingLabel, withFiles, type Attachment, type createAttachments, type Rejection } from "./attachments"
import { fileChip } from "./chip"
import { openLightbox } from "./lightbox"
import { CodeHighlight } from "./code-highlight"

type Attachments = ReturnType<typeof createAttachments>

/** Refused files never reach the tray: the composer shakes and a toast says why (TDS px3 reject). */
export function refuse(rejected: readonly Rejection[]) {
  if (rejected.length === 0) return
  if (!prefersReducedMotion())
    animate(document.querySelector(".tds-composer-row"),
      [{ translate: "0" }, { translate: "calc(var(--tds-space-6) * -1) 0" }, { translate: "var(--tds-space-6) 0" }, { translate: "calc(var(--tds-space-3) * -1) 0" }, { translate: "0" }],
      { duration: tokens.motion.duration.shake, easing: tokens.motion.curve.std },
    )
  for (const reason of rejected) toast(reason.title, { description: reason.hint, tone: "failed", icon: "prohibit", duration: tokens.motion.toast.error })
}

const touchesCode = (state: State) => {
  const code = state.schema.marks.code
  const { $from } = state.selection
  return !!code && [$from.nodeBefore, $from.nodeAfter].some((node) => node && code.isInSet(node.marks))
}

/**
 * Inline code never traps the caret: clearing the last code character drops the code mark instead of keeping it for the next keystroke,
 * and typing a backtick while in code steps out of it (ArrowRight at the end already exits, as the mark is exitable).
 */
const CodeExit = Extension.create({
  name: "codeExit",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, text) {
            const code = view.state.schema.marks.code
            if (text !== "`" || from !== to || !code) return false
            const active = (view.state.storedMarks ?? view.state.selection.$from.marks()).some((mark) => mark.type === code)
            if (!active) return false
            view.dispatch(view.state.tr.removeStoredMark(code))
            return true
          },
        },
        appendTransaction(transactions, before, after) {
          const code = after.schema.marks.code
          if (!code || !transactions.some((tr) => tr.docChanged) || !after.selection.empty) return null
          const stored = after.storedMarks ?? after.selection.$from.marks()
          if (!stored.some((mark) => mark.type === code) || touchesCode(after) || !touchesCode(before)) return null
          return after.tr.setStoredMarks(stored.filter((mark) => mark.type !== code))
        },
      }),
    ]
  },
})

export const attach = (attachments: Attachments, files: Iterable<File>, from?: DOMRect) => refuse(attachments.add(files, from))

function Card(props: { item: Attachment; from?: DOMRect; onRemove: () => void; onRetry: () => void; onOpen: (el: HTMLElement) => void; onPointerDown: (event: PointerEvent, el: HTMLElement) => void; onHover: (el: HTMLElement | null) => void }) {
  let el!: HTMLDivElement
  const ring = () => `${Math.round(props.item.progress * 100)} 100`
  const kind = () => fileChip(props.item.name)
  const collapse = () => {
    props.onHover(null)
    el.style.pointerEvents = "none"
    animate(el,
      [
        { opacity: 1, scale: "1", filter: "blur(0px)" },
        { opacity: 0, scale: String(tokens.motion["press-tight"]), filter: `blur(${tokens.motion.blur.exit})` },
      ],
      { duration: tokens.motion.duration.layout, easing: tokens.motion.curve.std, fill: "forwards" },
    ).onfinish = () => props.onRemove()
  }
  const retry = (event: MouseEvent) => {
    event.stopPropagation()
    props.onRetry()
  }
  let open!: HTMLButtonElement
  const label = () => (props.item.status === "uploading" ? `${props.item.name}, uploading ${formatSize(props.item.size * props.item.progress)} of ${formatSize(props.item.size)}` : props.item.status === "failed" ? `${props.item.name}, upload failed` : `Open ${props.item.name}`)
  return (
    <div
      ref={(node) => {
        el = node
        const from = props.from
        if (from) requestAnimationFrame(() => growFrom(node, from))
      }}
      class="tds-attach"
      data-kind={props.item.preview ? "image" : "doc"}
      data-status={props.item.status}
      data-key={props.item.key}
      style={{ "--tds-chip-accent": `var(--tds-chip-${kind().kind})` }}
      onPointerDown={(event) => props.onPointerDown(event, el)}
      onPointerEnter={() => props.onHover(el)}
      onPointerLeave={() => props.onHover(null)}
    >
      <button ref={open} type="button" class="tds-attach-open" aria-label={label()} aria-disabled={props.item.fileId ? undefined : "true"} onClick={() => props.item.fileId && props.onOpen(open)}>
        <Show
          when={props.item.preview}
          fallback={
            <>
              <b class="tds-attach-name">{props.item.name}</b>
              <span class="tds-attach-line num" data-shimmer={props.item.status === "reading" ? "" : undefined}>
                <TextMorph value={props.item.status === "failed" ? (props.item.error ?? "Upload failed") : props.item.status === "uploading" ? `${formatSize(props.item.size * props.item.progress)} of ${formatSize(props.item.size)}` : props.item.status === "reading" ? readingLabel(props.item.name) : (props.item.meta ?? formatSize(props.item.size))} />
              </span>
              <span class="tds-sq-pill">{extension(props.item.name)}</span>
            </>
          }
        >
          {(src) => <img src={src()} alt="" draggable={false} />}
        </Show>
      </button>
      <Show when={props.item.status === "failed"}>
        <button type="button" class="tds-attach-retry-pill tds-press" onPointerDown={(event) => event.stopPropagation()} onClick={retry}>
          Retry
        </button>
      </Show>
      <Show when={props.item.status === "uploading"}>
        <svg class="tds-attach-ring" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r="10" pathLength="100" />
          <circle cx="13" cy="13" r="10" pathLength="100" stroke-dasharray={ring()} />
        </svg>
      </Show>
      <button type="button" class="tds-attach-remove tds-press" aria-label={`Remove ${props.item.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={collapse}>
        <Icon name="x" size="chip" />
      </button>
    </div>
  )
}

/** The tray's hover card (TDS PxHover, files): a bigger look at the file after hover intent. */
function Preview(props: { item: Attachment; left: number; bottom: number }) {
  const kind = () => fileChip(props.item.name)
  return (
    <div class="tds-attach-preview" data-material="solid" role="tooltip" style={{ left: `${props.left}px`, bottom: `${props.bottom}px` }}>
      <Show when={props.item.preview}>{(src) => <img class="tds-attach-preview-image" src={src()} alt="" draggable={false} />}</Show>
      <div class="tds-attach-preview-head">
        <Show when={!props.item.preview}>
          <span class="tds-attach-glyph" data-kind={kind().kind} style={{ "--tds-chip-accent": `var(--tds-chip-${kind().kind})` }}>
            <Icon name={kind().icon} size="menu" />
            <b>{extension(props.item.name)}</b>
          </span>
        </Show>
        <span class="tds-attach-meta">
          <b>{props.item.name}</b>
          <span class="num">{props.item.status === "failed" ? props.item.error : (props.item.meta ?? formatSize(props.item.size))}</span>
        </span>
      </div>
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

const apps = [
  { key: "drive", label: "Google Drive", icon: "google-drive-logo" },
  { key: "github", label: "GitHub", icon: "github-logo" },
  { key: "notion", label: "Notion", icon: "notion-logo" },
] as const

const drafts = new Map<string, JSONContent>()
const typing = (e: KeyboardEvent) => e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
const editable = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)
const URL_ONLY = /^https?:\/\/\S+$/
const MARKDOWN = /(^|\n)(#{1,6} |[-*+] |\d+\. |> |```)|\*\*[^*\n]+\*\*|(^|\s)_[^_\n]+_(\s|$)|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)/
const pad = (value: number) => String(value).padStart(2, "0")

async function screenshot(): Promise<File | null> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  try {
    const video = document.createElement("video")
    video.muted = true
    video.srcObject = stream
    await video.play()
    if (!video.videoWidth) await new Promise((done) => video.addEventListener("resize", done, { once: true }))
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"))
    const now = new Date()
    return blob ? new File([blob], `Screenshot ${pad(now.getHours())}.${pad(now.getMinutes())}.png`, { type: "image/png" }) : null
  } finally {
    for (const track of stream.getTracks()) track.stop()
  }
}

export function Composer(props: { draftKey: string; working: boolean; attachments: Attachments; onSend: (text: string) => void; onStop: () => void }) {
  const navigate = useNavigate()
  const [empty, setEmpty] = createSignal(true)
  const [length, setLength] = createSignal(0)
  const [plusOpen, setPlusOpen] = createSignal(false)
  const [held, setHeld] = createSignal(false)
  const [trigger, setTrigger] = createSignal<Trigger | null>(null)
  const [active, setActive] = createSignal(0)
  const [caret, setCaret] = createSignal({ left: 0, bottom: 0 })
  const [preview, setPreview] = createSignal<{ key: string; left: number; bottom: number } | null>(null)
  const [glide, setGlide] = createSignal({ top: 0, height: 0 })
  let picker!: HTMLInputElement
  let wrap!: HTMLDivElement
  const reserve = new ResizeObserver(([entry]) => !(field && "sheet" in field.dataset) && wrap.parentElement?.style.setProperty("--composer-reserve", `${Math.ceil(entry!.borderBoxSize[0]!.blockSize)}px`))
  onSettled(() => reserve.observe(wrap))
  onCleanup(() => reserve.disconnect())
  let list: HTMLDivElement | undefined
  let editorEl: HTMLDivElement | undefined
  let tray: HTMLDivElement | undefined
  const blank = () => empty() && props.attachments.items().length === 0
  const pending = () => props.attachments.items().filter((item) => item.status === "uploading" || item.status === "reading")
  const failed = () => props.attachments.items().filter((item) => item.status === "failed")
  const tooLong = () => length() > tokens.limit["prompt-chars"]
  const [height, setHeight] = createSignal<number>(tokens.size.composer)
  let editor: Editor | undefined
  let field!: HTMLDivElement
  const [sheet, setSheet] = createSignal(false)
  const resting = () => untrack(height) + (untrack(props.attachments.items).length > 0 ? tokens.size["attach-tray"] : 0)
  const reach = () => field.getBoundingClientRect().bottom - (wrap.parentElement?.getBoundingClientRect().top ?? 0) - tokens.size.header - tokens.size["sheet-top"]
  let full = 0
  let sheetDrive: ReturnType<typeof drive> | undefined
  const mountField = (el: HTMLDivElement) => {
    field = el
    sheetDrive = drive(el, {
      preset: "glide",
      onFrame: (progress) => {
        if (progress <= 0 && !("sheet" in el.dataset)) return
        if (!("sheet" in el.dataset)) {
          full = reach()
          el.dataset.sheet = ""
        }
        el.style.setProperty("--sheet-from", `${resting()}px`)
        el.style.setProperty("--sheet-to", `${full}px`)
        recede(wrap.parentElement?.querySelector(".tds-transcript"), progress)
      },
      onRest: (progress) => {
        if (progress > 0) return
        delete el.dataset.sheet
        for (const name of ["--sheet-from", "--sheet-to"]) el.style.removeProperty(name)
      },
    })
  }
  const expand = (open: boolean, velocity?: number) => {
    setSheet(open)
    sheetDrive?.to(open ? 1 : 0, "glide", velocity)
    if (open) editor?.commands.focus()
  }
  const unbind: (() => void)[] = []
  const range = () => ("sheet" in field.dataset ? full : reach()) - resting()
  const grip = (el: HTMLButtonElement) =>
    unbind.push(
      scrub(el, {
        axis: "y",
        direction: -1,
        area: field,
        distance: range,
        from: () => sheetDrive?.value ?? 0,
        onProgress: (progress) => sheetDrive?.set(progress),
        onRelease: (open, velocity) => expand(open, (velocity * 1000) / Math.max(1, range())),
      }),
    )
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let key = ""
  let teardown = () => {}
  const stop = () => props.working && blank()
  const add = (files: Iterable<File>) => attach(props.attachments, files, wrap.querySelector(".tds-composer-plus")?.getBoundingClientRect())

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

  const text = () => (editor?.isEmpty ? "" : (editor?.getMarkdown().replace(/&nbsp;/g, " ").trim() ?? ""))

  /** T3Code's held send: a send while files upload or read waits for them, then goes on its own; editing or Esc cancels it. */
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
    setPreview(null)
    props.onSend(withFiles(text(), props.attachments.files()))
    props.attachments.clear()
    load(undefined)
    save(key)
    if (untrack(sheet)) expand(false)
    editor.view.focus()
    animate(editorEl, prefersReducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: `0 ${tokens.space[6]}px` }, { opacity: 1, translate: "0 0" }], { duration: tokens.motion.duration.tooltip, easing: tokens.motion.curve.out })
  }

  createEffect(
    () => held() && pending().length === 0,
    (ready) => {
      if (ready) untrack(submit)
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
    const host = wrap.getBoundingClientRect()
    setCaret({ left: at.left - host.left, bottom: host.bottom - at.top + tokens.size["menu-offset"] })
  }

  const longPaste = (value: string) => {
    const lines = value.split("\n").length
    if (lines <= tokens.limit["paste-lines"]) return false
    add([new File([value], "Pasted text.txt", { type: "text/plain" })])
    toast("Long text became a file", { description: `${lines} lines, so your message stays readable`, tone: "mono", icon: "text-align-left" })
    return true
  }

  const pasteLink = (value: string) => {
    const url = value.trim()
    if (!editor || !URL_ONLY.test(url)) return false
    const node = linkToken(url)
    if (!node) return false
    editor.chain().focus().insertContent([{ type: "token", attrs: node }, { type: "text", text: " " }]).run()
    return true
  }

  const hover = (key: string, el: HTMLElement | null) => {
    clearTimeout(hoverTimer)
    if (!el || drag) return setPreview(null)
    hoverTimer = setTimeout(() => {
      const box = el.getBoundingClientRect()
      const host = wrap.getBoundingClientRect()
      setPreview({ key, left: Math.max(0, Math.min(box.left - host.left, host.width - tokens.size["hover-card"])), bottom: host.bottom - box.top + tokens.size["menu-offset"] * 2 })
    }, tokens.motion["hover-intent"].open)
  }

  let drag: { key: string; el: HTMLElement; x: number; from: number; to: number; moved: boolean; cards: HTMLElement[]; centers: number[] } | null = null
  const grab = (event: PointerEvent, key: string, el: HTMLElement) => {
    if (event.button !== 0 || !tray) return
    const cards = [...tray.querySelectorAll<HTMLElement>(".tds-attach")]
    drag = { key, el, x: event.clientX, from: cards.indexOf(el), to: cards.indexOf(el), moved: false, cards, centers: cards.map((card) => card.getBoundingClientRect().left + card.offsetWidth / 2) }
  }
  const dragMove = (event: PointerEvent) => {
    if (!drag) return
    const dx = event.clientX - drag.x
    if (!drag.moved && Math.abs(dx) < tokens.space[6]) return
    if (!drag.moved) {
      drag.moved = true
      drag.el.dataset.dragging = ""
      clearTimeout(hoverTimer)
      setPreview(null)
    }
    drag.el.style.translate = `${dx}px 0`
    const center = drag.centers[drag.from]! + dx
    const to = drag.centers.filter((other, index) => index !== drag!.from && other < center).length
    drag.to = to
    const shift = drag.el.offsetWidth + tokens.space[8]
    drag.cards.forEach((card, index) => {
      if (card === drag!.el) return
      const moves = drag!.from < index && index <= to ? -shift : to <= index && index < drag!.from ? shift : 0
      card.style.translate = moves ? `${moves}px 0` : ""
    })
  }
  const drop = () => {
    if (!drag) return
    const done = drag
    drag = null
    if (!done.moved) return
    addEventListener("click", (event) => (event.stopPropagation(), event.preventDefault()), { capture: true, once: true })
    for (const card of done.cards) {
      card.style.transition = "none"
      card.style.translate = ""
      delete card.dataset.dragging
    }
    props.attachments.move(done.key, done.to)
    requestAnimationFrame(() => {
      for (const card of done.cards) card.style.transition = ""
    })
  }

  createEffect(
    () => [active(), suggestions().length] as const,
    ([index]) => {
      const row = list?.querySelectorAll<HTMLElement>(".tds-menu-item")[index]
      if (row) setGlide({ top: row.offsetTop, height: row.offsetHeight })
    },
  )

  const mount = (element: HTMLDivElement) => {
    editorEl = element
    editor = new Editor({
      element,
      autofocus: matchMedia("(pointer: fine)").matches ? "end" : false,
      extensions: [
        StarterKit.configure({ codeBlock: { HTMLAttributes: { "data-edge-fade": "both" } }, heading: false, horizontalRule: false, dropcursor: false, gapcursor: false, trailingNode: false, link: { openOnClick: false, autolink: false, linkOnPaste: false } }),
        Markdown,
        Token,
        CodeHighlight,
        CodeExit,
        Placeholder.configure({ placeholder: "Message toast" }),
      ],
      editorProps: {
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])]
          if (files.length > 0) {
            add(files)
            return true
          }
          const value = event.clipboardData?.getData("text/plain") ?? ""
          if (longPaste(value) || pasteLink(value)) return true
          if (event.clipboardData?.types.includes("text/html") || !MARKDOWN.test(value) || !editor) return false
          editor.commands.insertContent(value, { contentType: "markdown" })
          return true
        },
        attributes: { class: "tds-input", role: "textbox", "aria-multiline": "true", "aria-label": "Message toast", enterkeyhint: "send" },
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
            if (untrack(sheet)) return expand(false), true
            return false
          }
          if (event.key === "Backspace" && selectTokenBefore(view)) return true
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) return event.preventDefault(), submit(), true
          if (event.key === "Enter" && event.shiftKey && editor && !editor.isActive("codeBlock")) return editor.isActive("listItem") ? editor.commands.splitListItem("listItem") : editor.commands.splitBlock()
          if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229 || editor?.isActive("codeBlock")) return false
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
    const observer = new ResizeObserver(() => setHeight(Math.min((element.firstElementChild as HTMLElement | null)?.offsetHeight ?? element.scrollHeight, tokens.size["composer-max"])))
    observer.observe(element.firstElementChild ?? element)
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") return event.preventDefault(), picker.click()
      if (!editor || event.defaultPrevented || !typing(event) || editable(document.activeElement)) return
      editor.commands.focus("end")
    }
    const outside = (event: PointerEvent) => {
      if (untrack(sheet) && event.target instanceof Element && event.target.closest(".tds-transcript")) expand(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", outside)
    window.addEventListener("pointermove", dragMove)
    window.addEventListener("pointerup", drop)
    window.addEventListener("pointercancel", drop)
    teardown = () => {
      observer.disconnect()
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", outside)
      window.removeEventListener("pointermove", dragMove)
      window.removeEventListener("pointerup", drop)
      window.removeEventListener("pointercancel", drop)
    }
  }

  async function plus(action: string) {
    if (action === "files") return picker.click()
    if (action === "screenshot") {
      try {
        const shot = await screenshot()
        if (shot) add([shot])
      } catch (error) {
        if ((error as DOMException).name !== "NotAllowedError") toast("Couldn’t take a screenshot", { description: "Your browser didn’t share the screen", tone: "failed", icon: "warning-circle" })
      }
      return editor?.commands.focus("end")
    }
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const type = item.types.find((entry) => entry !== "text/plain" && entry !== "text/html")
        if (type) files.push(new File([await item.getType(type)], `pasted.${type.split("/")[1] ?? "bin"}`, { type }))
        else if (item.types.includes("text/plain")) {
          const value = await (await item.getType("text/plain")).text()
          if (!longPaste(value) && !pasteLink(value)) editor?.commands.insertContent(value)
        }
      }
      add(files)
    } catch {
      editor?.commands.insertContent(await navigator.clipboard.readText().catch(() => ""))
    }
    editor?.commands.focus("end")
  }

  onCleanup(() => {
    save(key)
    teardown()
    for (const off of unbind) off()
    sheetDrive?.set(0)
    clearTimeout(hoverTimer)
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
  const previewed = () => {
    const current = preview()
    const item = current && props.attachments.items().find((entry) => entry.key === current.key)
    return item && current ? { item, left: current.left, bottom: current.bottom } : null
  }

  return (
    <div ref={wrap} class="tds-composer-wrap">
      <Show when={trigger() && suggestions().length > 0}>
        <div ref={list} class="tds-menu tds-suggest tds-over" data-edge-fade="y" role="listbox" aria-label={trigger()?.char === "@" ? "Mention a chat" : "Commands"} style={{ left: "0px", transform: `translateX(${caret().left}px)`, bottom: `${caret().bottom}px` }}>
          <span class="tds-suggest-glide" aria-hidden="true" style={{ translate: `0 ${glide().top}px`, height: `${glide().height}px` }} />
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
      <Show when={previewed()}>{(current) => <Preview item={current().item} left={current().left} bottom={current().bottom} />}</Show>
      <Show when={held() && pending().length > 0}>
        <div class="tds-held tds-over" role="status" aria-live="polite">
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
      <form class="tds-composer-row" onSubmit={(e) => (e.preventDefault(), submit())}>
        <input ref={picker} type="file" multiple hidden onChange={(e) => (add([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ""))} />
        <Menu open={plusOpen()} onOpenChange={(next) => setPlusOpen(next)} onAction={(value) => void plus(String(value))}>
          <MenuTrigger class="tds-press tds-composer-plus tds-raise-1" aria-label="Add">
            <Icon name="plus" size="composer" class="tds-plus-glyph" />
          </MenuTrigger>
          <MenuContent class="tds-menu tds-plus-menu tds-over" data-edge-fade="y" side="top" align="start" sideOffset={tokens.size["menu-offset"]}>
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
            <MenuItem value="screenshot" class="tds-menu-item">
              <MenuItemIcon class="tds-menu-icon">
                <Icon name="camera" size="menu" />
              </MenuItemIcon>
              Take a Screenshot
            </MenuItem>
            <MenuItem value="clipboard" class="tds-menu-item">
              <MenuItemIcon class="tds-menu-icon">
                <Icon name="clipboard-text" size="menu" />
              </MenuItemIcon>
              Paste from Clipboard
            </MenuItem>
            <span class="tds-menu-gap" aria-hidden="true" />
            <MenuSub>
              <MenuSubTrigger class="tds-menu-item">
                <span class="tds-menu-icon">
                  <Icon name="plug" size="menu" />
                </span>
                From an App
                <span class="tds-menu-caret">
                  <Icon name="caret-right" size="chip" />
                </span>
              </MenuSubTrigger>
              <MenuSubContent class="tds-menu tds-plus-menu tds-over" data-edge-fade="y">
                <For each={apps} keyed={(entry) => entry.key}>
                  {(entry) => (
                    <MenuItem value={entry().key} disabled class="tds-menu-item">
                      <MenuItemIcon class="tds-menu-icon">
                        <Icon name={entry().icon} size="menu" />
                      </MenuItemIcon>
                      {entry().label}
                      <span class="tds-menu-soon">Soon</span>
                    </MenuItem>
                  )}
                </For>
              </MenuSubContent>
            </MenuSub>
          </MenuContent>
        </Menu>
        <button ref={grip} type="button" class="tds-sheet-grip" aria-label={sheet() ? "Collapse composer" : "Expand composer"} aria-expanded={sheet() ? "true" : "false"} onClick={() => expand(!untrack(sheet))} />
        <div ref={mountField} class="tds-field tds-raise-2" data-invalid={tooLong() ? "" : undefined} data-tall={height() > tokens.size.composer || props.attachments.items().length > 0 ? "" : undefined} style={{ height: `${height() + (props.attachments.items().length > 0 ? tokens.size["attach-tray"] : 0)}px` }}>
          <Show when={props.attachments.items().length > 0}>
            <div ref={(el) => ((tray = el), watchLayout(el, ".tds-attach", (card) => card.dataset.key ?? ""))} class="tds-attach-tray tds-scroll" data-edge-fade="x">
              <For each={props.attachments.items()} keyed={(item) => item.key}>
                {(item) => (
                  <Card
                    item={item()}
                    from={props.attachments.origin(item().key)}
                    onRemove={() => props.attachments.remove(item().key)}
                    onRetry={() => props.attachments.retry(item().key)}
                    onOpen={(el) => {
                      const ready = props.attachments.items().filter((entry) => entry.fileId)
                      openLightbox(ready.map((entry) => ({ id: entry.fileId!, name: entry.name })), ready.findIndex((entry) => entry.key === item().key), el)
                    }}
                    onPointerDown={(event, el) => grab(event, item().key, el)}
                    onHover={(el) => hover(item().key, el)}
                  />
                )}
              </For>
            </div>
          </Show>
          <div class="tds-field-body">
            <div ref={mount} class="tds-editor tds-scroll" data-edge-fade="y" onMouseDown={(e) => e.target === e.currentTarget && (e.preventDefault(), editor?.commands.focus("end"))} />
            <button type="button" class="tds-press tds-mic" aria-label="Dictate">
              <Icon name="waveform" size="composer" />
            </button>
          </div>
        </div>
        <button type="submit" class="tds-press tds-send tds-raise-2" data-empty={(blank() || tooLong()) && !stop() ? "" : undefined} data-held={held() ? "" : undefined} data-stop={stop() ? "" : undefined} aria-label={stop() ? "Stop" : held() ? "Sending when files finish" : "Send"}>
          <MorphIcon name={stop() ? "stop" : "arrow-up"} class={stop() ? "" : "tds-optical-up"} weight={tokens.icon["stroke-send"]} />
        </button>
      </form>
    </div>
  )
}
