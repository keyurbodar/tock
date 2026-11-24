import { Card, Page, Section, SettingsRow } from "@tock/ui/card"
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
