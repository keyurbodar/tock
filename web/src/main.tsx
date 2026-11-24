import { RegistryContext } from "@effect/atom-react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { routeTree } from "./routeTree.gen"
import { startAppearance } from "./state/appearance"
import { startData } from "./state/data"
import { registry } from "./state/registry"

const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

startAppearance()
startData()

const root = document.getElementById("root")
if (!root) throw new Error("missing #root")
createRoot(root).render(
  <StrictMode>
    <RegistryContext value={registry}>
      <RouterProvider router={router} />
    </RegistryContext>
  </StrictMode>,
)
