import { createFileRoute } from "@tanstack/solid-router"
import { useQuery } from "@tanstack/solid-query"
import { queryClient } from "../data/query-client"
import { conversationOptions } from "../data/queries"
import { ThreadView } from "../thread/thread-view"

export const Route = createFileRoute("/chat/$conversationId")({
  beforeLoad: ({ params }) => void queryClient.prefetchQuery(conversationOptions(params.conversationId)),
  component: ConversationPage,
})

function ConversationPage() {
  const params = Route.useParams()
  const conversation = useQuery(() => conversationOptions(params().conversationId))
  return (
    <ThreadView
      emptyBody="This fixture conversation is empty."
      emptyTitle={conversation.data?.title ?? "Conversation"}
      messages={conversation.data?.messages ?? []}
    />
  )
}
