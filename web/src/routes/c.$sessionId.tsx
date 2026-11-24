import { Delete02Icon, MoreHorizontalIcon, PencilEdit02Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Button, buttonVariants } from "@tock/ui/button"
import { DotGrid } from "@tock/ui/dot-grid"
import { Icon } from "@tock/ui/icon"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@tock/ui/menu"
import { Empty } from "@tock/ui/card"
import { toast } from "sonner"
import { AGENT } from "../agent"
import { Composer } from "../chat/composer"
import { Transcript } from "../chat/transcript"
import { useShell } from "../shell/context"
import { useSessions } from "../state/data"
import { abort, isWorking, send, useThread } from "../state/thread"

export const Route = createFileRoute("/c/$sessionId")({ component: Thread })

function Thread() {
  const { sessionId } = Route.useParams()
  const state = useThread(sessionId)
  const { sidebar, toggleSidebar } = useShell()
  const session = useSessions().find((item) => item.id === sessionId)
  const working = isWorking(state)
  const title = session?.title || state.pending[0] || "New chat"

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-panel">
        <header className="sticky top-0 z-(--z-top-bar) flex min-h-11 shrink-0 items-center border-b-[0.5px] border-border-1 bg-panel px-2">
          <span
            inert={sidebar === "open"}
            className={`flex shrink-0 items-center overflow-hidden transition-[width,margin,opacity] duration-base ease-out-quint motion-reduce:transition-none ${sidebar === "open" ? "mr-0 w-0 opacity-0" : "mr-1 w-(--h-control-sm) opacity-100"}`}
          >
            <Button size="icon-sm" aria-label="Open sidebar" onClick={toggleSidebar}>
              <Icon icon={SidebarLeftIcon} />
            </Button>
          </span>
          <div className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 items-center gap-1.5 px-2 text-xs font-medium text-foreground">
              <span role="img" aria-label={AGENT.name} className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-inner)">
                <img alt="" draggable={false} src={AGENT.character} className="size-full object-contain select-none" />
              </span>
              <span className="min-w-0 truncate">{title}</span>
              {working ? <DotGrid state="working" label="Working" className="size-(--icon-sm)" /> : null}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 pl-2">
            <Link to="/" aria-label="New chat" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
              <Icon icon={PencilEdit02Icon} />
            </Link>
            <Menu>
              <MenuTrigger render={<Button size="icon-sm" aria-label="Thread options" />}>
                <Icon icon={MoreHorizontalIcon} />
              </MenuTrigger>
              <MenuContent align="end" className="w-48">
                <MenuItem
                  onSelect={() => {
                    void navigator.clipboard.writeText(location.href)
                    toast("Link copied")
                  }}
                >
                  Copy link
                </MenuItem>
                <MenuItem danger disabled={!working} onSelect={() => void abort(sessionId)}>
                  <Icon icon={Delete02Icon} />
                  Stop run
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {state.phase === "missing" ? (
            <div className="flex flex-1 items-center justify-center">
              <Empty title="This chat is unavailable" description="It may have been removed, or the connection dropped." />
            </div>
          ) : (
            <Transcript state={state} />
          )}
          <div className="min-h-0 px-4 pb-[calc(0.25rem+var(--safe-bottom))]">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col justify-end pb-3">
              <Composer
                sessionId={sessionId}
                working={working}
                autoFocus
                onSend={({ text, model, thinkingLevel }) => void send(sessionId, text, { model, thinkingLevel })}
                onStop={() => void abort(sessionId)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
