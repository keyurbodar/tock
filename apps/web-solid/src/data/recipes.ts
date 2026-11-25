import { queryOptions } from "@tanstack/solid-query"
import { fixtureRecipes } from "../fixtures/recipes"
import { isFixtureMode } from "../fixtures/mode"

export const recipesOptions = () =>
  queryOptions({
    queryKey: ["fixtures", "recipes", isFixtureMode()],
    queryFn: async () => (isFixtureMode() ? fixtureRecipes : []),
    initialData: [],
  })
