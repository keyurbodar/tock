import { createContext, use } from "react"

export type SidebarState = "open" | "closed"

export const ShellContext = createContext<{ sidebar: SidebarState; toggleSidebar: () => void }>({
  sidebar: "open",
  toggleSidebar: () => undefined,
})

export const useShell = () => use(ShellContext)
