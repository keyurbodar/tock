import type { FixtureRecipe } from "./types"

export const fixtureRecipes: FixtureRecipe[] = Array.from({ length: 34 }, (_, index) => {
  const number = index + 1
  return {
    id: `recipe-${String(number).padStart(3, "0")}`,
    name: `Routine ${number}`,
    schedule: number % 3 === 0 ? "Every weekday at 08:30" : number % 3 === 1 ? "Every hour" : "Every Sunday at 18:00",
    enabled: number % 5 !== 0,
    lastRun: `2026-11-${String((index % 24) + 1).padStart(2, "0")}T07:30:00Z`,
    summary: `Checks fixture source ${number}, summarizes the result, and writes one memory entry when something changed.`,
  }
})

export const emptyRecipesCopy = {
  title: "No recipes yet",
  body: "Recipes run recurring work while you are away. Create one to automate a repeated check.",
  action: "New recipe",
}
