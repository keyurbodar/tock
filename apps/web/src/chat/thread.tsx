import { createEffect, createMemo, untrack } from "solid-js"
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
  return (
    <section class="relative flex min-w-0 flex-1 flex-col bg-main">
      <Header title={titleOf(session())} working={isWorking(state())} />
      <Transcript state={state()} />
      <Composer draftKey={params.id} working={isWorking(state())} onSend={(text) => void send(params.id, text)} onStop={() => void abort(params.id)} />
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
