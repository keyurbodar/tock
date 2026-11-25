import { queryOptions } from "@tanstack/solid-query"
import { fixtureConversations } from "../fixtures/chat"
import { isFixtureMode } from "../fixtures/mode"

const enabled = () => isFixtureMode()

export const conversationOptions = (id: string) =>
  queryOptions({
    queryKey: ["fixtures", "conversation", id, enabled()],
    queryFn: async () => (enabled() ? (fixtureConversations.find((item) => item.id === id) ?? null) : null),
  })
