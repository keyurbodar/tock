import { createRootRoute } from "@tanstack/solid-router"
import { queryClient } from "../data/query-client"
import { conversationsOptions } from "../data/queries"
import { AppShell } from "../shell/app-shell"

export const Route = createRootRoute({
  beforeLoad: () => void queryClient.prefetchQuery(conversationsOptions()),
  component: AppShell,
})
