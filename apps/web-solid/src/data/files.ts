import { queryOptions } from "@tanstack/solid-query"
import { fixtureFiles } from "../fixtures/files"
import { isFixtureMode } from "../fixtures/mode"

export const filesOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "files", isFixtureMode()],
    queryFn: async () => (isFixtureMode() ? fixtureFiles : []),
    initialData: [],
  })
