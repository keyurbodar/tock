import { createFileRoute } from "@tanstack/solid-router"
import { ThreadView } from "../thread/thread-view"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return <ThreadView emptyBody="Choose a fixture chat from the sidebar or start a new one." />
}
