import { createFileRoute } from "@tanstack/solid-router"
import { For } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { queryClient } from "../data/query-client"
import { settingsOptions } from "../data/settings"

export const Route = createFileRoute("/settings")({
  beforeLoad: () => void queryClient.prefetchQuery(settingsOptions()),
  component: SettingsPage,
})

function SettingsPage() {
  const settings = useQuery(() => settingsOptions())
  return (
    <div class="screen-page">
      <div class="screen-grid">
        <section class="screen-card">
          <h2>Settings</h2>
          <p>Owner and agent defaults for this deployment.</p>
        </section>
        <For each={settings.data}>
          {(section) => (
            <section class="screen-card">
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
