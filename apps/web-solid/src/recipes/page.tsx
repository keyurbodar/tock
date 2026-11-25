import { createMemo, createSignal, For, Show } from "solid-js"
import { Input } from "@tock/ui-solid/input"
import { fixtureRecipeCatalog } from "../fixtures/recipe-catalog"
import type { RecipeCard } from "../fixtures/types"
import { PlusIcon, SearchIcon } from "../shell/icons"
import "../screens/page.css"
import "./recipe.css"

type RecipeInstall = {
  slug: string
  roomId: string
  roomName: string
  paused: boolean
  nextRun: string
}

const initialInstalls: RecipeInstall[] = [
  { slug: "daily-weather", roomId: "c-showcase", roomName: "Doop shell parity", paused: false, nextRun: "Tomorrow at 7:30" },
  { slug: "bad-weather-alerts", roomId: "c-showcase", roomName: "Doop shell parity", paused: true, nextRun: "Paused" },
  { slug: "apartment-hunter", roomId: "c-bulk", roomName: "Large deterministic thread", paused: false, nextRun: "In 24 minutes" },
]

const toneVar = (recipe: RecipeCard) => (recipe.tone ? `var(--recipe-${recipe.tone})` : undefined)

function RecipeGlyph(props: { recipe: RecipeCard; plus?: boolean }) {
  return (
    <span class="tpl-tile" data-tone={props.recipe.tone ? "" : undefined} style={toneVar(props.recipe) ? { "--tile-tone": toneVar(props.recipe) } : undefined}>
      <svg class="tpl-glyph" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" innerHTML={props.recipe.glyph} />
      <Show when={props.plus}>
        <span class="tpl-plus">+</span>
      </Show>
    </span>
  )
}

function RecipeChip(props: { children: import("@solidjs/web").JSX.Element }) {
  return <span class="recipe-chip">{props.children}</span>
}

function RecipeTile(props: { recipe: RecipeCard; installed: boolean; onAdd: () => void }) {
  return (
    <article class="tpl page-card recipe-tile" data-recipe={props.recipe.slug} data-on={props.installed ? "" : undefined}>
      <RecipeGlyph recipe={props.recipe} plus={!props.installed} />
      <span class="recipe-tile-main">
        <span class="recipe-title">{props.recipe.title}</span>
        <span class="recipe-description">{props.recipe.description}</span>
        <span class="recipe-card-foot">
          <RecipeChip>{props.installed ? "Running" : props.recipe.when}</RecipeChip>
          <Show when={props.recipe.apps[0]}>
            {(app) => <RecipeChip>{app().name}</RecipeChip>}
          </Show>
        </span>
      </span>
      <Show when={!props.installed}>
        <button aria-label={`Add ${props.recipe.title}`} class="recipe-add" data-action="add-recipe" onClick={props.onAdd} type="button">
          <PlusIcon />
        </button>
      </Show>
    </article>
  )
}

function InstallCard(props: { install: RecipeInstall; recipe: RecipeCard; onToggle: () => void }) {
  return (
    <article class="tpl page-card recipe-install" data-install={props.install.slug} data-status={props.install.paused ? "paused" : "next"}>
      <RecipeGlyph recipe={props.recipe} />
      <span class="recipe-tile-main">
        <span class="recipe-title">{props.recipe.title}</span>
        <span class="recipe-description">{props.recipe.description}</span>
        <span class="recipe-card-foot">
          <RecipeChip>{props.recipe.when}</RecipeChip>
          <RecipeChip>{props.install.roomName}</RecipeChip>
        </span>
      </span>
      <span class="recipe-install-side">
        <span class="recipe-next">{props.install.paused ? "Paused" : props.install.nextRun}</span>
        <button
          aria-checked={!props.install.paused ? "true" : "false"}
          aria-label={`${props.install.paused ? "Resume" : "Pause"} ${props.recipe.title}`}
          class="tpl-switch"
          data-action="recipe-pause"
          onClick={props.onToggle}
          role="switch"
          type="button"
        />
      </span>
    </article>
  )
}

export default function RecipesPage() {
  const [query, setQuery] = createSignal("")
  const [view, setView] = createSignal("yours")
  const [installs, setInstalls] = createSignal<RecipeInstall[]>(initialInstalls)
  const installedSlugs = createMemo(() => new Set(installs().map((install) => install.slug)))
  const tags = createMemo(() => [...new Set(fixtureRecipeCatalog.flatMap((recipe) => recipe.tags))].sort())
  const matches = (recipe: RecipeCard) => {
    const q = query().trim().toLowerCase()
    return !q || `${recipe.title} ${recipe.description} ${recipe.when}`.toLowerCase().includes(q)
  }
  const yours = createMemo(() => installs().flatMap((install) => {
    const recipe = fixtureRecipeCatalog.find((card) => card.slug === install.slug)
    return recipe && matches(recipe) ? [{ install, recipe }] : []
  }))
  const shown = createMemo(() => {
    const current = view()
    return fixtureRecipeCatalog.filter((recipe) => matches(recipe) && (current === "all" || recipe.tags.includes(current)))
  })
  const templates = createMemo(() => fixtureRecipeCatalog.filter((recipe) => matches(recipe) && !installedSlugs().has(recipe.slug)).slice(0, 6))
  const add = (recipe: RecipeCard) => {
    if (installedSlugs().has(recipe.slug)) return
    setInstalls((items) => [...items, { slug: recipe.slug, roomId: "c-empty", roomName: "Empty conversation", paused: false, nextRun: "Starting soon" }])
  }
  const toggle = (slug: string) => {
    setInstalls((items) => items.map((install) => install.slug === slug ? { ...install, paused: !install.paused } : install))
  }

  return (
    <div class="kiko-page" data-component="page-frame">
      <header class="kiko-page-header">
        <div class="kiko-page-header-inner">
          <h1 class="kiko-page-title">Recipes</h1>
          <div class="kiko-page-actions">
            <Input aria-label="Search recipes" class="kiko-page-search" onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search recipes" value={query()} />
            <button aria-label="Search recipes" class="kiko-tool-button" type="button"><SearchIcon /></button>
            <button class="kiko-primary-button" type="button"><PlusIcon /> New recipe</button>
          </div>
        </div>
      </header>
      <div class="kiko-page-body">
        <div class="recipes-content" data-component="recipes-page">
          <div aria-label="Recipes" class="kiko-chip-row" data-component="recipes-nav" role="tablist">
            <button aria-selected={view() === "yours" ? "true" : "false"} class="kiko-tab-chip" onClick={() => setView("yours")} role="tab" type="button">Yours</button>
            <button aria-selected={view() === "all" ? "true" : "false"} class="kiko-tab-chip" onClick={() => setView("all")} role="tab" type="button">All templates</button>
            <For each={tags()}>{(tag) => <button aria-selected={view() === tag ? "true" : "false"} class="kiko-tab-chip" onClick={() => setView(tag)} role="tab" type="button">{tag}</button>}</For>
          </div>

          <Show when={view() === "yours"}>
            <div class="recipes-yours" data-component="recipes-yours">
              <Show
                when={yours().length}
                fallback={
                  <div class="kiko-empty-card" data-component="recipes-empty">
                    <div>
                      <p class="kiko-empty-title">{query() ? "Nothing of yours matches" : "No recipes yet"}</p>
                      <p class="kiko-empty-body">Recipes are jobs your team runs on a schedule or when something happens.</p>
                    </div>
                    <button class="kiko-primary-button" type="button"><PlusIcon /> New recipe</button>
                  </div>
                }
              >
                <div class="recipes-install-list">
                  <For each={yours()}>{({ install, recipe }) => <InstallCard install={install} recipe={recipe} onToggle={() => toggle(install.slug)} />}</For>
                </div>
              </Show>
              <Show when={templates().length}>
                <section class="recipes-template-section">
                  <div class="kiko-section-head">
                    <h2>{yours().length ? "More from templates" : "Start from a template"}</h2>
                    <button class="kiko-tab-chip" onClick={() => setView("all")} type="button">Show all</button>
                  </div>
                  <div class="recipes-grid">
                    <For each={templates()}>{(recipe) => <RecipeTile installed={false} onAdd={() => add(recipe)} recipe={recipe} />}</For>
                  </div>
                </section>
              </Show>
            </div>
          </Show>

          <Show when={view() !== "yours"}>
            <Show when={shown().length} fallback={<div class="kiko-empty-card"><p class="kiko-empty-title">Nothing matches</p></div>}>
              <div class="recipes-grid" data-component="recipes-grid">
                <For each={shown()}>{(recipe) => <RecipeTile installed={installedSlugs().has(recipe.slug)} onAdd={() => add(recipe)} recipe={recipe} />}</For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}
