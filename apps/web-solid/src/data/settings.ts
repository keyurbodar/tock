import { queryOptions } from "@tanstack/solid-query"
import { fixtureSettings } from "../fixtures/settings"
import { isFixtureMode } from "../fixtures/mode"

export const settingsOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "settings", isFixtureMode()],
    queryFn: async () => (isFixtureMode() ? fixtureSettings : []),
    initialData: [],
  })
