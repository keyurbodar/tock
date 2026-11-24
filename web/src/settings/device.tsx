import { Card, Page, Section, SettingsRow } from "@tock/ui/card"
import { Kbd } from "@tock/ui/kbd"
import { Switch } from "@tock/ui/switch"
import { useEffect, useState } from "react"
import { http } from "../api/http"
import { socket } from "../api/socket"
import { act } from "../lib/remote"

const toKey = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

const encode = (buffer: ArrayBuffer | null) =>
  buffer === null ? "" : btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

export function Notifications() {
  const supported = "serviceWorker" in navigator && "PushManager" in window
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    http<{ pushPublicKey: string | null }>("/api/status")
      .then((status) => setPublicKey(status.pushPublicKey))
      .catch(() => undefined)
    if (!supported) return
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setEnabled(subscription != null))
      .catch(() => undefined)
  }, [supported])

  const enable = async () => {
    if (publicKey === null) throw new Error("Push keys are not set on the Worker")
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site")
    const registration = await navigator.serviceWorker.register("/sw.js")
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) })
    await socket.request("push.subscribe", {
      endpoint: subscription.endpoint,
      p256dh: encode(subscription.getKey("p256dh")),
      auth: encode(subscription.getKey("auth")),
    })
    setEnabled(true)
  }

  const disable = async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await socket.request("push.unsubscribe", { endpoint: subscription.endpoint })
      await subscription.unsubscribe()
    }
    setEnabled(false)
  }

  const reason = !supported
    ? "This browser does not support push notifications"
    : publicKey === null
      ? "Set VAPID keys on the Worker to turn this on"
      : "Get a notification when a routine or a long run finishes"
  return (
    <Page title="Notifications">
      <Section title="This browser">
        <Card>
          <SettingsRow title="Push notifications" description={reason}>
            <Switch
              aria-label="Push notifications"
              checked={enabled}
              disabled={!supported || publicKey === null}
              onCheckedChange={(next) => void act(next ? enable : disable)}
            />
          </SettingsRow>
        </Card>
      </Section>
    </Page>
  )
}

const MOD = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"

const SHORTCUTS: readonly { group: string; items: readonly { label: string; keys: readonly string[] }[] }[] = [
  { group: "General", items: [{ label: "Open command menu", keys: [MOD, "K"] }] },
  {
    group: "Composer",
    items: [
      { label: "Send message", keys: ["Enter"] },
      { label: "New line", keys: ["Shift", "Enter"] },
    ],
  },
]

export function Shortcuts() {
  return (
    <Page title="Shortcuts">
      <section className="flex flex-col gap-5">
        <div className="-mx-4">
          <div role="table" className="isolate grid w-full grid-cols-[minmax(0,1fr)_auto] px-4 [--table-row-h:50px]">
            <div role="row" className="col-span-full grid h-8 grid-cols-subgrid items-center">
              <div role="columnheader" className="flex min-w-0 items-center gap-0.5 pr-4 text-xs font-normal whitespace-nowrap text-muted-foreground-1 select-none">
                Command
              </div>
              <div role="columnheader" className="flex min-w-0 items-center gap-0.5 text-xs font-normal whitespace-nowrap text-muted-foreground-1 select-none">
                Shortcut
              </div>
            </div>
            {SHORTCUTS.map((group) => (
              <div key={group.group} className="contents">
                <div role="row" className="relative col-span-full mb-0.5 grid h-8 grid-cols-subgrid items-center">
                  <div className="absolute -inset-x-2 inset-y-0 rounded-(--radius-card) bg-section" />
                  <span className="relative col-span-full flex items-center text-xs font-medium text-muted-foreground-1">
                    <span className="flex items-center gap-1.5">
                      {group.group}
                      <span className="text-muted-foreground-3 tabular-nums">{group.items.length}</span>
                    </span>
                  </span>
                </div>
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    role="row"
                    className="relative col-span-full grid grid-cols-subgrid before:absolute before:-inset-x-2 before:inset-y-0 before:rounded before:transition-colors before:duration-100 hover:before:bg-section"
                  >
                    <div role="cell" className="relative flex min-h-[var(--table-row-h,50px)] min-w-0 items-center pr-4 text-xs font-normal text-foreground">
                      {item.label}
                    </div>
                    <div role="cell" className="relative flex min-h-[var(--table-row-h,50px)] min-w-0 items-center gap-1 text-xs font-normal">
                      {item.keys.map((key) => (
                        <Kbd key={key} variant="chip" className="shrink-0 pointer-coarse:hidden">{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </Page>
  )
}
