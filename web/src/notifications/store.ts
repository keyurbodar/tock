import { useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { socket } from "../api/socket"
import { registry } from "../state/registry"
import { deviceLabel, type PushDevice } from "./device"

const STORAGE_KEY = "tock.notification-prefs"
const WORKER = "/sw.js"

export type Permission = NotificationPermission | "unsupported"
export type PushSupport = "supported" | "install" | "unsupported"

export interface SystemNotification {
  readonly title: string
  readonly body: string
  readonly tag: string
  readonly href: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

function stored(): boolean {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    return isRecord(value) && typeof value.desktop === "boolean" ? value.desktop : true
  } catch {
    return true
  }
}

const desktopAtom = Atom.make(stored()).pipe(Atom.keepAlive)

export const useDesktop = (): boolean => useAtomValue(desktopAtom)

export function saveDesktop(next: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ desktop: next }))
  registry.set(desktopAtom, next)
}

export const permission = (): Permission => (typeof Notification === "undefined" ? "unsupported" : Notification.permission)

export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window) return "supported"
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return ios && !matchMedia("(display-mode: standalone)").matches ? "install" : "unsupported"
}

export const thisDevice = (): string => deviceLabel(navigator.userAgent, navigator.maxTouchPoints)

export async function showSystemNotification(notice: SystemNotification, open: (href: string) => void): Promise<boolean> {
  if (permission() !== "granted") return false
  try {
    const shown = new Notification(notice.title, { body: notice.body, tag: notice.tag })
    shown.onclick = () => {
      window.focus()
      open(notice.href)
      shown.close()
    }
    return true
  } catch {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration(WORKER) : undefined
    if (registration === undefined) return false
    return registration.showNotification(notice.title, { body: notice.body, tag: notice.tag, data: { href: notice.href } }).then(
      () => true,
      () => false,
    )
  }
}

const toKey = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

const encode = (buffer: ArrayBuffer | null) =>
  buffer === null ? "" : btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

async function subscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null
  const registration = await navigator.serviceWorker.getRegistration(WORKER)
  return (await registration?.pushManager.getSubscription()) ?? null
}

export const currentEndpoint = async (): Promise<string | null> => (await subscription())?.endpoint ?? null

export async function listDevices(endpoint: string | null): Promise<readonly PushDevice[]> {
  const reply = await socket.request<{ devices: PushDevice[] }>("push.list", endpoint === null ? {} : { endpoint })
  return reply.devices
}

export async function enablePush(publicKey: string): Promise<"granted" | "denied"> {
  if ((await Notification.requestPermission()) !== "granted") return "denied"
  await navigator.serviceWorker.register(WORKER, { updateViaCache: "none" })
  const registration = await navigator.serviceWorker.ready
  const created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) })
  await socket.request("push.subscribe", {
    endpoint: created.endpoint,
    p256dh: encode(created.getKey("p256dh")),
    auth: encode(created.getKey("auth")),
    label: thisDevice(),
  })
  return "granted"
}

export async function disablePush(): Promise<void> {
  const current = await subscription()
  if (current === null) return
  await current.unsubscribe()
  await removeDevice(current.endpoint)
}

export async function removeDevice(endpoint: string): Promise<void> {
  await socket.request("push.unsubscribe", { endpoint })
}

export function startNotifications(open: (href: string) => void): void {
  socket.onEvent(({ event, payload }) => {
    if (event !== "notification.push" || !registry.get(desktopAtom) || !isRecord(payload)) return
    const { title, body, ts } = payload
    if (typeof title !== "string" || typeof body !== "string") return
    void showSystemNotification({ title, body, tag: `tock-${String(ts)}`, href: "/" }, open)
  })
}
