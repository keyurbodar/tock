import { Drawer, DrawerBackdrop, DrawerContent } from "@tock/ui-solid/drawer"
import type { FixtureConversationSummary } from "../fixtures/types"
import { RailLinks, SidebarContent } from "./sidebar"

type MobileDrawerProps = {
  activeId?: string
  conversations: FixtureConversationSummary[]
  onNavigate: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export default function MobileDrawer(props: MobileDrawerProps) {
  return (
    <Drawer onOpenChange={props.onOpenChange} open={props.open} side="start">
      <DrawerBackdrop class="tui-drawer-backdrop" />
      <DrawerContent class="tui-drawer-content mobile-drawer-shell" aria-label="Navigation">
        <nav aria-label="Primary" class="shell-rail">
          <RailLinks />
        </nav>
        <section aria-label="Conversations" class="shell-panel">
          <SidebarContent activeId={props.activeId} conversations={props.conversations} onNavigate={props.onNavigate} />
        </section>
      </DrawerContent>
    </Drawer>
  )
}
