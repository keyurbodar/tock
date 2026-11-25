import { createFileRoute } from "@tanstack/solid-router"
import RecipesPage from "../recipes/page"

export const Route = createFileRoute("/recipes")({ component: RecipesPage })
