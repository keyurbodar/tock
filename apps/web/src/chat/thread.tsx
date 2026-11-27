import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { createAttachments } from "./attachments"
import { useParams } from "@solidjs/router"
import { abort, app, isWorking, send, subscribe, titleOf } from "../state/app"
import { Composer } from "./composer"
import { Header } from "./header"
import { Transcript } from "./transcript"

export function Thread() {
  const params = useParams<{ id: string }>()
  createEffect(
    () => params.id,
    (id) => void untrack(() => subscribe(id)),
  )
  const state = () => app.threads[params.id]
  const session = createMemo(() => app.sessions.find((s) => s.id === params.id))
  const attachments = createAttachments()
  const [dragging, setDragging] = createSignal(false)
  let depth = 0
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false
  return (
    <section
      class="relative flex min-w-0 flex-1 flex-col bg-main"
      onDragEnter={(e) => hasFiles(e) && (e.preventDefault(), depth++, setDragging(true))}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={(e) => hasFiles(e) && --depth <= 0 && ((depth = 0), setDragging(false))}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth = 0
        setDragging(false)
        attachments.add([...(e.dataTransfer?.files ?? [])])
      }}
    >
      <Header title={titleOf(session())} working={isWorking(state())} />
      <Transcript state={state()} />
      <Composer draftKey={params.id} attachments={attachments} working={isWorking(state())} onSend={(text) => void send(params.id, text)} onStop={() => void abort(params.id)} />
      <Show when={dragging()}>
        <div class="tds-drop" aria-hidden="true">
          <span class="tds-drop-fan">
            <i><Icon name="file-pdf" size="menu" /></i>
            <i><Icon name="image" size="menu" /></i>
            <i><Icon name="file-text" size="menu" /></i>
          </span>
          <b>Drop to add to your message</b>
          <span>Images, PDFs, docs, code, audio and video, up to {tokens.limit["file-mb"]} MB each</span>
        </div>
      </Show>
    </section>
  )
}

export function Home() {
  return (
    <section class="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-12 bg-main text-center">
      <img src="/brand/toast-mascot-128.svg" alt="" class="size-pin" draggable={false} />
      <b class="text-title">Pick a chat, or start one</b>
      <span class="text-secondary text-muted">Everything toast is working on lives in the sidebar.</span>
    </section>
  )
}
