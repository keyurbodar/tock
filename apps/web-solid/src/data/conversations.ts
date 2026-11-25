import { queryOptions } from "@tanstack/solid-query"
import { fixtureConversationSummaries } from "../fixtures/conversation-summaries"
import { isFixtureMode } from "../fixtures/mode"

const enabled = () => isFixtureMode()

export const conversationsOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "conversations", enabled()],
    queryFn: async () => (enabled() ? fixtureConversationSummaries : []),
    initialData: enabled() ? fixtureConversationSummaries : [],
  })
