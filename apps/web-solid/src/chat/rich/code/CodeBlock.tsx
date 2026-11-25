import { createSignal, For, onCleanup, onSettled } from "solid-js"
import { highlight, plainLines, type CodeLine } from "./highlight"
import "./code-block.css"

type CodeFile = { lang?: string; name?: string; text: string }

function CopyIcon(props: { copied: () => boolean }) {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24" width="14">
      {props.copied() ? <path d="m5 13 4 4L19 7" /> : <><rect height="14" rx="2" width="14" x="8" y="8" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>}
    </svg>
  )
}

export function CodeBlock(props: { files: CodeFile[]; streaming?: boolean }) {
  const [active, setActive] = createSignal(0)
  const [copied, setCopied] = createSignal(false)
  const [wrapped, setWrapped] = createSignal(false)
  const [lines, setLines] = createSignal<readonly CodeLine[]>(plainLines(props.files[0]?.text ?? ""))
  let timer: ReturnType<typeof setTimeout> | undefined
  const file = () => props.files[Math.min(active(), props.files.length - 1)] ?? { text: "" }

  onSettled(() => {
    let cancelled = false
    const load = async () => {
      const current = file()
      const highlighted = current.lang ? await highlight(current.text, current.lang).catch(() => null) : null
      if (!cancelled) setLines(highlighted ?? plainLines(current.text))
    }
    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  })
  onCleanup(() => clearTimeout(timer))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file().text)
      setCopied(true)
      clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard can be unavailable in insecure contexts.
    }
  }

  return (
    <figure class="chat-code" data-bar="" data-wrap={wrapped() ? "" : undefined}>
      <figcaption class="chat-code-head">
        {props.files.length > 1 ? (
          <div class="chat-code-tabs" role="tablist">
            <For each={props.files}>
              {(item, index) => (
                <button
                  aria-selected={active() === index() ? "true" : "false"}
                  class="chat-code-tab"
                  data-active={active() === index() ? "" : undefined}
                  onClick={() => {
                    setActive(index())
                    setLines(plainLines(item.text))
                    void highlight(item.text, item.lang).then((next) => setLines(next ?? plainLines(item.text)))
                  }}
                  role="tab"
                  type="button"
                >
                  {item.name ?? item.lang ?? `file ${index() + 1}`}
                </button>
              )}
            </For>
          </div>
        ) : (
          <span class="chat-code-title">
            <span class="chat-code-name">{file().name ?? file().lang ?? "code"}</span>
          </span>
        )}
        <div class="chat-code-actions">
          <button aria-label="Wrap code" class="chat-code-action" data-active={wrapped() ? "" : undefined} onClick={() => setWrapped((value) => !value)} type="button">
            <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24" width="14"><path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-3" /><path d="m12 15 3 3-3 3" /></svg>
          </button>
          <button aria-label={copied() ? "Copied" : "Copy code"} class="chat-code-action" onClick={copy} type="button">
            <CopyIcon copied={copied} />
          </button>
        </div>
      </figcaption>
      <div class="chat-code-body">
        <pre class="chat-code-pre"><code class="chat-code-lines" style={{ "--digits": String(lines().length) }}>
          <For each={lines()}>
            {(line, index) => (
              <span class="chat-code-line">
                <span class="chat-code-ln">{index() + 1}</span>
                <span class="chat-code-text">
                  <For each={line}>{(token) => <span class={`sh-${token.type}`}>{token.text}</span>}</For>
                </span>
              </span>
            )}
          </For>
        </code></pre>
      </div>
    </figure>
  )
}
