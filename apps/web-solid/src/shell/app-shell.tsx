import { Outlet, useLocation, useParams } from "@tanstack/solid-router"
import { createSignal, Show } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { Drawer, DrawerBackdrop, DrawerContent, DrawerTrigger } from "@tock/ui-solid/drawer"
import { conversationsOptions } from "../data/queries"
import { MenuIcon } from "./icons"
import { RailLinks, SidebarContent } from "./sidebar"

function routeConversationId() {
  const params = useParams({ strict: false })
  return () => (params() as { conversationId?: string }).conversationId
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const location = useLocation()
  const conversationId = routeConversationId()
  const conversations = useQuery(() => conversationsOptions())
  const navigate = () => setDrawerOpen(false)
  const title = () => {
    const id = conversationId()
    if (!id) return location().pathname === "/" ? "Tock" : location().pathname.slice(1)
    return conversations.data.find((item) => item.id === id)?.title ?? "Chat"
  }

  return (
    <Drawer onOpenChange={setDrawerOpen} open={drawerOpen()} side="start">
      <div class="shell">
        <aside class="shell-sidebar">
          <nav aria-label="Primary" class="shell-rail">
            <RailLinks />
          </nav>
          <section aria-label="Conversations" class="shell-panel">
            <SidebarContent activeId={conversationId()} conversations={conversations.data} />
          </section>
        </aside>
        <div class="shell-main">
          <header class="shell-header">
            <div class="header-title">
              <DrawerTrigger aria-label="Open navigation" class="tui-button tui-button--icon mobile-only">
                <MenuIcon />
              </DrawerTrigger>
              <span>{title()}</span>
            </div>
            <div class="header-actions desktop-only" />
          </header>
          <main class="shell-outlet">
            <Outlet />
          </main>
        </div>
      </div>
      <Show when={drawerOpen()}>
        <DrawerBackdrop class="tui-drawer-backdrop" />
      </Show>
      <DrawerContent class="tui-drawer-content mobile-drawer-shell" aria-label="Navigation">
        <nav aria-label="Primary" class="shell-rail">
          <RailLinks />
        </nav>
        <section aria-label="Conversations" class="shell-panel">
          <SidebarContent activeId={conversationId()} conversations={conversations.data} onNavigate={navigate} />
        </section>
      </DrawerContent>
    </Drawer>
  )
}
