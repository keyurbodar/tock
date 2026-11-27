import { createMemo, createSignal, For, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { VList } from "virtua/solid"
import { Icon, type IconName } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { TextMorph } from "@tock/ui/text-morph"
import { app, createSession, titleOf, type Session } from "../state/app"
import { shortTime } from "../lib/time"
import { now } from "../lib/clock"

const glyphs: readonly { icon: IconName; hue: string }[] = [
  { icon: "code", hue: "text-hue-blue" },
  { icon: "calendar-check", hue: "text-hue-rose" },
  { icon: "chart-line-up", hue: "text-hue-sage" },
  { icon: "hash", hue: "text-hue-violet" },
  { icon: "globe", hue: "text-hue-sand" },
  { icon: "broom", hue: "text-hue-butter" },
  { icon: "currency-dollar", hue: "text-hue-teal" },
  { icon: "airplane-tilt", hue: "text-hue-sky" },
  { icon: "palette", hue: "text-hue-pink" },
]
const glyphFor = (id: string) => glyphs[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % glyphs.length]!

function Highlight(props: { text: string; query: string }) {
  const parts = () => {
    const q = props.query.trim().toLowerCase()
    if (!q) return [{ text: props.text, hit: false }]
    const at = props.text.toLowerCase().indexOf(q)
    if (at < 0) return [{ text: props.text, hit: false }]
    return [
      { text: props.text.slice(0, at), hit: false },
      { text: props.text.slice(at, at + q.length), hit: true },
      { text: props.text.slice(at + q.length), hit: false },
    ]
  }
  return <For each={parts()}>{(part) => (part.hit ? <b class="tds-hit">{part.text}</b> : part.text)}</For>
}

function Row(props: { session: Session; selected: boolean; query: string }) {
  return (
    <div class="px-0 pb-0">
      <a
        href={`/t/${props.session.id}`}
        class="tds-row group tds-hoverfill"
        data-selected={props.selected ? "" : undefined}
        data-status={props.session.busy ? "working" : undefined}
        aria-current={props.selected ? "page" : undefined}
      >
        <span class={`tds-row-icon ${glyphFor(props.session.id).hue}`}>
          <Icon name={glyphFor(props.session.id).icon} size="row" />
        </span>
        <span class="tds-row-title">
          <Highlight text={titleOf(props.session)} query={props.query} />
        </span>
        <span class="tds-row-time num">{shortTime(props.session.updatedAt, now())}</span>
        <span class="tds-row-preview">{props.session.preview || " "}</span>
        <span class="tds-row-mark">
          <Show when={props.session.busy}>
            <Orb status="working" surface={props.selected ? "sel" : "side"} />
          </Show>
        </span>
        <span class="tds-row-more" aria-hidden="true">
          <Icon name="dots-three" size="row" />
        </span>
      </a>
    </div>
  )
}

export function Sidebar() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [query, setQuery] = createSignal("")
  let search!: HTMLInputElement
  const visible = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return app.sessions
    return app.sessions.filter((s) => `${s.title} ${s.preview}`.toLowerCase().includes(q))
  })
  const working = createMemo(() => app.sessions.find((s) => s.busy))
  const startChat = async () => navigate(`/t/${await createSession()}`)

  addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      search.focus()
      search.select()
    }
  })

  return (
    <aside class="relative flex min-h-0 w-sidebar-panel flex-none flex-col bg-side px-12 pt-20" aria-label="Chats">
      <div class="flex gap-6">
        <label class="tds-search" data-filled={query() ? "" : undefined}>
          <Icon name="magnifying-glass" size="menu" class="tds-search-glyph" />
          <input ref={search} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Search" aria-label="Search chats" onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())} />
          <kbd class="tds-search-hint">⌘K</kbd>
        </label>
        <button type="button" class="tds-press grid size-new-chat flex-none place-items-center rounded-pill bg-glass text-tx2 shadow-glass" aria-label="New chat" onClick={startChat}>
          <Icon name="note-pencil" size="menu" />
        </button>
      </div>

      <button type="button" class="tds-toast-row tds-hoverfill">
        <img src="/brand/toast-mascot-36.svg" alt="" class="size-mascot flex-none rounded-small" draggable={false} />
        <span class="min-w-0 flex-1 pl-6 text-left">
          <b class="block text-name">toast</b>
          <span class="block truncate text-preview text-muted">
            <TextMorph value={working() ? `working on ${working()!.title.toLowerCase()}` : "here when you need me"} />
          </span>
        </span>
        <Icon name="caret-down" size="menu" class="text-faint" />
      </button>

      <div class="relative -mx-12 min-h-0 flex-1">
        <Show
          when={visible().length > 0}
          fallback={
            <div class="px-12 py-36 text-center text-secondary text-muted">
              <b class="mb-4 block text-body text-tx2">{query() ? "No chats match" : app.sessionsLoaded ? "No chats yet" : "Loading chats"}</b>
              {query() ? "Try fewer words." : "Start one with the pencil."}
            </div>
          }
        >
          <VList data={visible()} class="tds-scroll h-full px-12 pb-16" itemSize={tokens.size.row}>
            {(session) => <Row session={session} selected={params.id === session.id} query={query()} />}
          </VList>
        </Show>
      </div>
    </aside>
  )
}
