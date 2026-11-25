import { createSignal, onCleanup, Show } from "solid-js"
import type { RichEditor } from "./rich/editor"
import { loadComposerEditor, scheduleComposerPreload } from "./lazy"
import { composingKey, enterIsNewline } from "./ime"
import { AttachIcon, MicIcon } from "../shell/icons"
import "./composer.css"

type ComposerProps = {
  draftKey?: string
  onSend?: (markdown: string) => void
  ref?: (element: HTMLElement | undefined) => void
}

function chip(label: string) {
  return (dom: HTMLElement) => {
    dom.classList.add("composer-inline-chip")
    dom.textContent = label
    return () => undefined
  }
}

function draftKey(key: string | undefined) {
  return key ? `tock:composer-draft:${key}` : undefined
}

export function Composer(props: ComposerProps) {
  let host: HTMLDivElement | undefined
  let editor: RichEditor | undefined
  let mounting = false
  const [empty, setEmpty] = createSignal(true)
  const [ready, setReady] = createSignal(false)
  const storageKey = () => draftKey(props.draftKey)

  const persist = (markdown: string) => {
    const key = storageKey()
    if (!key) return
    if (markdown.trim()) localStorage.setItem(key, markdown)
    else localStorage.removeItem(key)
  }

  const submit = () => {
    if (!editor || editor.isEmpty()) return
    const markdown = editor.snapshot().markdown
    props.onSend?.(markdown)
    editor.setMarkdown("")
    setEmpty(true)
    persist("")
    editor.focus()
  }

  const mount = async () => {
    if (editor || mounting || !host) return
    mounting = true
    try {
      const module = await loadComposerEditor()
      if (!host || editor) return
      editor = module.mountRichEditor({
        element: host,
        markdown: (storageKey() ? localStorage.getItem(storageKey()!) : null) ?? "",
        label: "Message the agent",
        parse: {},
        token: (dom, token) => chip(`${token.sign}${token.name}`)(dom),
        chip: (dom, attachment) => chip(attachment.name)(dom),
        fileRef: (dom, ref) => chip(ref.path.split("/").filter(Boolean).at(-1) ?? ref.path)(dom),
        onChange: (snapshot) => {
          setEmpty(editor?.isEmpty() ?? snapshot.markdown.trim() === "")
          persist(snapshot.markdown)
        },
        onCursor: () => undefined,
        onKeyDown: (event) => {
          if (event.key !== "Enter" || event.shiftKey || event.altKey || composingKey(event) || enterIsNewline(event)) {
            return false
          }
          event.preventDefault()
          if (!event.repeat) submit()
          return true
        },
        onPaste: () => false,
        onFocus: () => undefined,
        onBlur: () => undefined,
      })
      setEmpty(editor.isEmpty())
      setReady(true)
      queueMicrotask(() => editor?.focus())
    } finally {
      mounting = false
    }
  }

  const intent = () => {
    scheduleComposerPreload()
    void mount()
  }

  onCleanup(() => editor?.destroy())

  return (
    <footer class="composer-footer" ref={props.ref}>
      <div class="composer-dock" data-component="composer-dock">
        <div class="composer-box">
          <div
            class="composer-main"
            onClick={() => {
              if (editor) editor.focus()
              else intent()
            }}
          >
            <button aria-label="Attach file" class="composer-icon" type="button">
              <AttachIcon />
            </button>
            <div class="composer-field">
              <div
                aria-label="Message the agent"
                class="composer-rich-host"
                data-empty={empty() ? "" : undefined}
                data-ready={ready() ? "" : undefined}
                onFocus={intent}
                onMouseEnter={scheduleComposerPreload}
                onPointerDown={intent}
                onTouchStart={scheduleComposerPreload}
                ref={host}
                role="textbox"
                tabindex={ready() ? -1 : 0}
              />
              <Show when={empty()}>
                <div class="composer-placeholder">Message the agent…</div>
              </Show>
            </div>
            <button aria-label="Dictate message" class="composer-icon" type="button">
              <MicIcon />
            </button>
            <button aria-label="Send message" class="composer-send" disabled={empty()} onClick={submit} type="button">
              <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="18">
                <path d="m5 12 14-7-4 7 4 7-14-7Z" />
                <path d="M15 12H5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
