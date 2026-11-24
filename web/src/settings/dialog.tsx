import { useNavigate, useSearch } from "@tanstack/react-router"
import { SettingsDialog, type SettingsHealth } from "@tock/ui/settings-dialog"
import { useCallback, useSyncExternalStore } from "react"
import { version } from "../../package.json"
import { AGENT } from "../agent"
import { socket, type ConnectionState } from "../api/socket"
import { Appearance } from "./appearance"
import { Notifications } from "./notifications"
import { General } from "./general"
import { Connections } from "./connections"
import { Models, Plugins, Secrets, Skills } from "./lists"
import { Shortcuts } from "./shortcuts"
import { isSection, SECTIONS, type SectionId, type SettingsView } from "./sections"

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

const HEALTH: Readonly<Record<ConnectionState, SettingsHealth>> = {
  open: "running",
  connecting: "waiting",
  closed: "unreachable",
}

const subscribe = (notify: () => void) => socket.onState(notify)
const connection = () => socket.state

export function useSettingsNavigation() {
  const navigate = useNavigate()
  return useCallback(
    (settings: SettingsView | undefined, replace = false) => void navigate({ to: ".", search: (previous) => ({ ...previous, settings }), replace }),
    [navigate],
  )
}

export function SettingsHost() {
  const view = useSearch({ strict: false, select: (search) => search.settings })
  const go = useSettingsNavigation()
  const health = HEALTH[useSyncExternalStore(subscribe, connection)]
  const section = view !== undefined && isSection(view) ? view : null
  const View = section === null ? null : VIEWS[section]
  const onView = useCallback((next: string | null, replace: boolean) => go(next !== null && isSection(next) ? next : "list", replace), [go])
  const onClose = useCallback(() => go(undefined), [go])
  const status: Readonly<Record<SettingsHealth, string>> = {
    running: `${AGENT.name} is running`,
    waiting: "Reconnecting",
    unreachable: `Can't reach ${AGENT.name}`,
  }
  return (
    <SettingsDialog
      open={view !== undefined}
      view={section}
      entries={SECTIONS}
      fallback="general"
      health={health}
      status={status[health]}
      version={version}
      onView={onView}
      onClose={onClose}
    >
      {View === null ? null : <View />}
    </SettingsDialog>
  )
}
