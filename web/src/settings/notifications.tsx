import { ComputerIcon, SafariIcon } from "@hugeicons/core-free-icons"
import { Button } from "@tock/ui/button"
import { Card, ListRow, Page, Section, SettingsRow } from "@tock/ui/card"
import { usePhoneLayout } from "@tock/ui/drawer"
import { ChromeMark } from "@tock/ui/glyph"
import { Icon } from "@tock/ui/icon"
import { Badge } from "@tock/ui/input"
import { Switch } from "@tock/ui/switch"
import { toast } from "@tock/ui/toast"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { http } from "../api/http"
import { deviceStatus, type PushDevice } from "../notifications/device"
import {
  currentEndpoint,
  disablePush,
  enablePush,
  listDevices,
  permission,
  pushSupport,
  removeDevice,
  saveDesktop,
  showSystemNotification,
  thisDevice,
  useDesktop,
  type Permission,
} from "../notifications/store"

const SYSTEM = "Show a system notification when your agent sends an alert"

const systemDescription = (state: Permission) =>
  state === "unsupported"
    ? "This browser has no system notifications"
    : state === "denied"
      ? "Blocked by the browser, allow notifications for this site to turn it on"
      : SYSTEM

function deviceIcon(label: string): ReactNode {
  if (label.startsWith("Safari")) return <Icon icon={SafariIcon} />
  if (label.startsWith("Chrome") || label.startsWith("Edge")) return <ChromeMark />
  return <Icon icon={ComputerIcon} />
}

function General() {
  const navigate = useNavigate()
  const desktop = useDesktop()
  const [state, setState] = useState(permission)
  const enabled = desktop && state === "granted"

  const toggle = (next: boolean) => {
    if (!next) return saveDesktop(false)
    void Notification.requestPermission().then((result) => {
      setState(result)
      saveDesktop(result === "granted")
    })
  }

  const test = async () => {
    const shown =
      enabled &&
      (await showSystemNotification(
        {
          title: "Test notification",
          body: "An alert from your agent looks like this, click to open settings",
          tag: "tock-test-notification",
          href: "/settings/notifications",
        },
        (href) => void navigate({ href }),
      ))
    if (!shown) toast.info("Turn on system notifications to see one")
  }

  return (
    <Section>
      <Card>
        <SettingsRow id="system-notifications" title="System notifications" description={systemDescription(state)}>
          <Switch
            aria-label="System notifications"
            checked={enabled}
            disabled={state === "denied" || state === "unsupported"}
            onCheckedChange={toggle}
          />
        </SettingsRow>
        <SettingsRow id="test-notification" title="Test notification" description="Ring this device the way an alert from your agent would">
          <Button variant="ghost" size="sm" onClick={() => void test()}>
            Send test notification
          </Button>
        </SettingsRow>
      </Card>
    </Section>
  )
}

interface DeviceList {
  readonly publicKey: string | null
  readonly own: string | null
  readonly devices: readonly PushDevice[]
}

function Devices() {
  const phone = usePhoneLayout()
  const support = pushSupport()
  const [list, setList] = useState<DeviceList | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now)

  const load = useCallback(async () => {
    const [status, own] = await Promise.all([http<{ pushPublicKey: string | null }>("/api/status"), currentEndpoint()])
    setList({ publicKey: status.pushPublicKey, own, devices: await listDevices(own) })
    setNow(Date.now())
  }, [])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  if (list === null) return null
  const own = list.devices.find((device) => device.endpoint === list.own)
  if (support === "unsupported" && own === undefined) return null
  const others = list.devices.filter((device) => device.endpoint !== list.own)

  const badge = <Badge tone="accent">This device</Badge>
  const withBadge = (text: string) => (
    <span className="flex items-center gap-2">
      {text}
      {badge}
    </span>
  )
  const title = (text: string) => (phone ? text : withBadge(text))
  const description = (text: string) => (phone ? withBadge(text) : text)

  const run = (action: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    action()
      .then(load)
      .catch(() => toast.error(failure))
      .finally(() => setBusy(false))
  }

  const enable = () => {
    const key = list.publicKey
    if (key === null) return
    run(async () => {
      if ((await enablePush(key)) === "denied") toast.info("Allow notifications for this site to turn on push")
    }, "Could not turn on push on this device")
  }

  const ownRow =
    own !== undefined ? (
      <ListRow icon={deviceIcon(own.label)} title={title(own.label)} description={description(deviceStatus(own, now))}>
        <Switch
          aria-label="Push on this device"
          checked
          disabled={busy}
          onCheckedChange={() => run(disablePush, "Could not turn off push on this device")}
        />
      </ListRow>
    ) : support === "install" ? (
      <ListRow
        icon={<Icon icon={ComputerIcon} />}
        title={title(thisDevice())}
        description={description("Add Tock to your Home Screen first, then turn on push here")}
      />
    ) : support === "supported" ? (
      <ListRow icon={deviceIcon(thisDevice())} title={title(thisDevice())} description={description("Not receiving push")}>
        <Button size="sm" loading={busy} onClick={enable}>
          {phone ? "Enable" : "Enable on this device"}
        </Button>
      </ListRow>
    ) : null

  return (
    <Section title="Devices" description="Push reaches these browsers and installed apps even when Tock is closed">
      <Card>
        {list.publicKey === null ? (
          <ListRow title="Push is not configured on this deployment" />
        ) : (
          <>
            {ownRow}
            {others.map((device) => (
              <ListRow key={device.endpoint} icon={deviceIcon(device.label)} title={device.label} description={deviceStatus(device, now)}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => run(() => removeDevice(device.endpoint), "Could not remove the device")}
                >
                  Remove
                </Button>
              </ListRow>
            ))}
          </>
        )}
      </Card>
    </Section>
  )
}

export function Notifications() {
  return (
    <Page title="Notifications" description="How Tock reaches you when your agent sends an alert">
      <General />
      <Devices />
    </Page>
  )
}
