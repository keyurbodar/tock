import { createFileRoute } from "@tanstack/solid-router"
import { useQuery } from "@tanstack/solid-query"
import { Tree, treeFromPaths } from "@tock/ui-solid/tree"
import { queryClient } from "../data/query-client"
import { filesOptions } from "../data/files"

export const Route = createFileRoute("/files")({
  beforeLoad: () => void queryClient.prefetchQuery(filesOptions()),
  component: FilesPage,
})

function FilesPage() {
  const files = useQuery(() => filesOptions())
  const items = () => treeFromPaths(files.data.map((file) => file.path))
  return (
    <div class="screen-page">
      <div class="screen-grid">
        <section class="screen-card">
          <h2>Files</h2>
          <p>Fixture files render through the ui-sdk tree primitive.</p>
        </section>
        <section class="screen-card">
          <Tree aria-label="Files" defaultExpanded={["/vault", "/vault/projects", "/vault/projects/tock"]} items={items()} />
        </section>
      </div>
    </div>
  )
}
