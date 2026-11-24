import { createFileRoute, notFound } from "@tanstack/react-router"
import { Appearance } from "../settings/appearance"
import { Notifications, Shortcuts } from "../settings/device"
import { General } from "../settings/general"
import { Connections, Models, Plugins, Secrets, Skills } from "../settings/lists"
import { PageHeader } from "../shell/page-header"
import { isSection, type SectionId } from "../settings/sections"

export const Route = createFileRoute("/settings/$section")({
  beforeLoad: ({ params }) => {
    if (!isSection(params.section)) throw notFound()
  },
  component: Settings,
})

const VIEWS: Readonly<Record<SectionId, () => React.ReactNode>> = {
  general: General,
  appearance: Appearance,
  models: Models,
  connections: Connections,
  secrets: Secrets,
  skills: Skills,
  plugins: Plugins,
  notifications: Notifications,
  shortcuts: Shortcuts,
}

function Settings() {
  const { section } = Route.useParams()
  if (!isSection(section)) return null
  const View = VIEWS[section]
  return (
    <>
      <PageHeader />
      <View />
    </>
  )
}
