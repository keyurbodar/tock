import { Outlet, useLocation, useParams } from "@tanstack/solid-router"
import { createSignal, lazy, Show } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { Button } from "@tock/ui-solid/button"
import { conversationsOptions } from "../data/conversations"
import { MenuIcon } from "./icons"
import { RailLinks, SidebarContent } from "./sidebar"

const MobileDrawer = lazy(() => import("./mobile-drawer"))

function routeConversationId() {
  const params = useParams({ strict: false })
  return () => (params() as { conversationId?: string }).conversationId
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [drawerLoaded, setDrawerLoaded] = createSignal(false)
  const location = useLocation()
  const conversationId = routeConversationId()
  const conversations = useQuery(() => conversationsOptions())
  const navigate = () => setDrawerOpen(false)
  const openDrawer = () => {
    setDrawerLoaded(true)
    setDrawerOpen(true)
  }
  const title = () => {
    const id = conversationId()
    if (!id) return location().pathname === "/" ? "Tock" : location().pathname.slice(1)
    return conversations.data.find((item) => item.id === id)?.title ?? "Chat"
  }

  return (
    <>
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
              <Button aria-label="Open navigation" class="tui-button--icon mobile-only" onClick={openDrawer} type="button">
                <MenuIcon />
              </Button>
              <span>{title()}</span>
            </div>
            <div class="header-actions desktop-only" />
          </header>
          <main class="shell-outlet">
            <Outlet />
          </main>
        </div>
      </div>
      <Show when={drawerLoaded()}>
        <MobileDrawer
          activeId={conversationId()}
          conversations={conversations.data}
          onNavigate={navigate}
          onOpenChange={setDrawerOpen}
          open={drawerOpen()}
        />
      </Show>
    </>
  )
}
