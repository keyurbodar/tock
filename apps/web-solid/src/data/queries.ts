import { queryOptions } from "@tanstack/solid-query"
import { fixtureConversations, fixtureFiles, fixtureRecipes, fixtureSettings, isFixtureMode } from "../fixtures"

const enabled = () => isFixtureMode()

export const conversationsOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "conversations", enabled()],
    queryFn: async () => (enabled() ? fixtureConversations : []),
    initialData: enabled() ? fixtureConversations : [],
  })

export const conversationOptions = (id: string) =>
  queryOptions({
    queryKey: ["fixtures", "conversation", id, enabled()],
    queryFn: async () => (enabled() ? (fixtureConversations.find((item) => item.id === id) ?? null) : null),
  })

export const filesOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "files", enabled()],
    queryFn: async () => (enabled() ? fixtureFiles : []),
    initialData: [],
  })

export const recipesOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "recipes", enabled()],
    queryFn: async () => (enabled() ? fixtureRecipes : []),
    initialData: [],
  })

export const settingsOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "settings", enabled()],
    queryFn: async () => (enabled() ? fixtureSettings : []),
    initialData: [],
  })
