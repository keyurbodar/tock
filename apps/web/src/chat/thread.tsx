import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { morphInto } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { createAttachments, isReadable } from "./attachments"
import { useNavigate, useParams } from "@solidjs/router"
import { abort, app, isWorking, newThreadId, send, subscribe, titleOf } from "../state/app"
import { attach, Composer } from "./composer"
import { Header } from "./header"
import { glyphFor } from "../lib/glyph"
import { Empty } from "./empty"
import type { OrbStatus } from "@tock/ui/orb"
import { Transcript } from "./transcript"
import { ChipCards } from "./chip-card"
import { Boundary } from "../shell/boundary"
import { followupsIn, hasPendingAsk } from "./items"
import { Followups } from "./followups"

export function Thread() {
  const params = useParams<{ id: string }>()
  createEffect(
    () => params.id,
    (id) => void untrack(() => subscribe(id)),
  )
  let main!: HTMLElement
  createEffect(
    () => params.id,
    () => morphInto(main),
  )
  const state = () => app.threads[params.id]
  const session = createMemo(() => app.sessions.find((s) => s.id === params.id))
  createEffect(
    () => titleOf(session()),
    (title) => void (document.title = `${title} · Tock`),
  )
  const status = (): OrbStatus | undefined => {
    const s = state()
    if (s?.fresh && hasPendingAsk(s.entries)) return "needs"
    if (isWorking(s)) return "working"
    if (s?.live?.runFailure && s.live.runFailure.reason !== "aborted") return "failed"
    return undefined
  }
  const attachments = createAttachments()
  const [dragging, setDragging] = createSignal(false)
  const [unreadable, setUnreadable] = createSignal(false)
  let depth = 0
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false
  const enter = (e: DragEvent) => {
    e.preventDefault()
    depth++
    setUnreadable([...(e.dataTransfer?.items ?? [])].some((item) => item.kind === "file" && item.type !== "" && !isReadable("", item.type)))
    setDragging(true)
  }
  return (
    <main
      ref={main}
      id="main"
      tabindex="-1"
      data-backdrop-layer
      class="relative flex min-w-0 flex-1 flex-col bg-main"
      data-pane="thread"
      onDragEnter={(e) => hasFiles(e) && enter(e)}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={(e) => hasFiles(e) && --depth <= 0 && ((depth = 0), setDragging(false))}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth = 0
        setDragging(false)
        attach(attachments, [...(e.dataTransfer?.files ?? [])], new DOMRect(e.clientX, e.clientY, 1, 1))
      }}
    >
      <Header title={titleOf(session())} glyph={session() || (state()?.entries.length ?? 0) > 0 ? glyphFor(params.id) : undefined} status={status()} loading={!session() && !app.sessionsLoaded} shape={`title:${params.id}`} />
      <Show when={state()?.phase !== "ready" || state()!.entries.length > 0 || state()!.pending.length > 0} fallback={<div class="tds-transcript grid"><Empty art="hi" /></div>}>
        <Boundary surface="transcript">
          <Transcript state={state()} sessionId={params.id} />
        </Boundary>
      </Show>
      <ChipCards />
      <Boundary surface="composer">
        <Followups set={followupsIn(state()?.entries ?? [])} working={isWorking(state())} onPick={(prompt) => void send(params.id, prompt)} />
        <Composer draftKey={params.id} attachments={attachments} working={isWorking(state())} onSend={(text) => void send(params.id, text)} onStop={() => void abort(params.id)} />
      </Boundary>
      <Show when={dragging()}>
        <div class="tds-drop tds-veil-glass" data-bad={unreadable() ? "" : undefined} aria-hidden="true">
          <span class="tds-drop-fan">
            <i><Icon name="file-pdf" size="menu" /></i>
            <i><Icon name="image" size="menu" /></i>
            <i><Icon name="file-text" size="menu" /></i>
          </span>
          <b>{unreadable() ? "Tock can’t read some of these" : "Drop to add to your message"}</b>
          <span>{unreadable() ? "Try a PDF, image, text or code file" : `Images, PDFs, docs, code, audio and video, up to ${tokens.limit["file-mb"]} MB each`}</span>
        </div>
      </Show>
    </main>
  )
}

export function Home() {
  const navigate = useNavigate()
  createEffect(
    () => true,
    () => void (document.title = "Tock"),
  )
  return (
    <main id="main" tabindex="-1" data-backdrop-layer class="relative flex min-w-0 flex-1 flex-col items-center justify-center bg-main" data-pane="home">
      <h1 class="sr-only">Tock</h1>
      <Empty art="hi" action={{ label: "New Chat", run: () => navigate(`/t/${newThreadId()}`) }} />
    </main>
  )
}
