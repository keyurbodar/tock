import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "@tock/ui/toast"
import { Composer } from "../chat/composer"
import { HomeSidebarButton } from "../shell/page-header"
import { createSession, send } from "../state/thread"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  const navigate = useNavigate()
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-clip">
      <HomeSidebarButton />
      <div className="relative flex flex-1 items-center justify-center px-6">
        <div className="flex w-full max-w-[712px] flex-col pb-[10dvh]">
          <Composer
            autoFocus
            working={false}
            onSend={async ({ text, model, thinkingLevel }) => {
              try {
                const sessionId = await createSession()
                void send(sessionId, text, { model, thinkingLevel })
                await navigate({ to: "/c/$sessionId", params: { sessionId } })
              } catch {
                toast.error("Could not start a chat")
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
