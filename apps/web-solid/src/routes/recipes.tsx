import { createFileRoute } from "@tanstack/solid-router"
import { For } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { queryClient } from "../data/query-client"
import { recipesOptions } from "../data/queries"

export const Route = createFileRoute("/recipes")({
  beforeLoad: () => void queryClient.prefetchQuery(recipesOptions()),
  component: RecipesPage,
})

function RecipesPage() {
  const recipes = useQuery(() => recipesOptions())
  return (
    <div class="screen-page">
      <div class="screen-grid">
        <section class="screen-card">
          <h2>Recipes</h2>
          <p>Reusable agent workflows.</p>
        </section>
        <For each={recipes.data}>
          {(recipe) => (
            <section class="screen-card">
              <h3>{recipe.name}</h3>
              <p>{recipe.summary}</p>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
