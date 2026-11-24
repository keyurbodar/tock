import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router"
import { wallpaperImage } from "@tock/theme/apply"
import { Backdrop } from "@tock/ui/backdrop"
import { useEffect, useState } from "react"
import { Toaster } from "sonner"
import { ShellContext, type SidebarState } from "../shell/context"
import { Palette } from "../shell/palette"
import { Sidebar } from "../shell/sidebar"
import { useAppearance } from "../state/appearance"
import { paletteAtom, useSessions } from "../state/data"
import { registry } from "../state/registry"

export const Route = createRootRoute({ component: Root })

const DESKTOP = "(min-width: 768px)"

function Root() {
  const [sidebar, setSidebar] = useState<SidebarState>(() => (matchMedia(DESKTOP).matches ? "open" : "closed"))
  const pathname = useLocation({ select: (location) => location.pathname })
  const appearance = useAppearance()
  const sessions = useSessions().filter((session) => session.messageCount > 0)
  const home = pathname === "/"
  const toggleSidebar = () => setSidebar((value) => (value === "open" ? "closed" : "open"))

  useEffect(() => {
    if (!matchMedia(DESKTOP).matches) setSidebar("closed")
  }, [pathname])

  return (
    <ShellContext value={{ sidebar, toggleSidebar }}>
      <div className="group/shell flex h-dvh min-w-0 flex-1 flex-col" data-sidebar={sidebar}>
        <div className="flex min-h-0 flex-1">
          <Sidebar
            sessions={sessions}
            owner="Keyur"
            settings={pathname.startsWith("/settings")}
            onSearch={() => registry.set(paletteAtom, true)}
            onToggle={toggleSidebar}
          />
          <button
            type="button"
            aria-label="Close sidebar"
            tabIndex={-1}
            onClick={toggleSidebar}
            className="fixed inset-0 z-(--z-top-bar) bg-overlay transition-opacity duration-base ease-out-quint group-data-[sidebar=closed]/shell:pointer-events-none group-data-[sidebar=closed]/shell:opacity-0 md:hidden"
          />
          <div
            data-slot="sidebar-gap"
            className="relative w-(--sidebar-width) shrink-0 transition-[width] duration-base ease-out-quint group-data-[sidebar=closed]/shell:w-2 max-md:hidden motion-reduce:transition-none"
          />
          <div
            data-slot="sidebar-panel"
            className="relative isolate flex min-w-0 flex-1 flex-col overflow-clip bg-panel transition-[margin-left] duration-base ease-out-quint motion-reduce:transition-none md:my-2 md:mr-2 md:rounded-(--radius-panel) md:border-[0.5px] md:border-(--card-hairline) md:shadow-card"
          >
            {home ? <Backdrop image={wallpaperImage(appearance)} effect={appearance.effect} appearance={appearance.look} masked /> : null}
            <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
      <Palette />
      <Toaster position="bottom-right" theme="system" />
    </ShellContext>
  )
}
