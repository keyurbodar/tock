import { SidebarLeftIcon } from "@hugeicons/core-free-icons"
import { Button } from "@tock/ui/button"
import { Icon } from "@tock/ui/icon"
import { useShell } from "./context"

function OpenSidebar() {
  const { toggleSidebar } = useShell()
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" aria-pressed="false" onClick={toggleSidebar}>
      <Icon icon={SidebarLeftIcon} />
    </Button>
  )
}

export function PageHeader() {
  const { sidebar } = useShell()
  if (sidebar === "open") return null
  return (
    <header className="sticky top-0 z-(--z-top-bar) flex min-h-11 shrink-0 items-center bg-panel px-2">
      <span className="-mr-1 flex w-(--h-control-sm) shrink-0 items-center overflow-hidden opacity-100">
        <OpenSidebar />
      </span>
    </header>
  )
}

export function HomeSidebarButton() {
  const { sidebar } = useShell()
  if (sidebar === "open") return null
  return (
    <div className="absolute top-1.5 left-2 z-(--z-top-bar)">
      <OpenSidebar />
    </div>
  )
}
