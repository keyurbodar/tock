import "@tock/tokens/index.css"
import "./app.css"

import { render } from "@solidjs/web"
import { QueryClientProvider } from "@tanstack/solid-query"
import { createRouter, RouterProvider } from "@tanstack/solid-router"
import { queryClient } from "./data/query-client"
import { routeTree } from "./routeTree.gen"

const router = createRouter({
  defaultPreload: "intent",
  defaultPreloadDelay: 50,
  routeTree,
})

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")

if (!root) throw new Error("missing root element")

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  ),
  root,
)
