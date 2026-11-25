import { useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { http } from "../api/http"
import { socket } from "../api/socket"
import type { ModelInfo, OwnerSettings, ProviderInfo, SessionSummary } from "../api/types"
import { registry } from "./registry"

export const sessionsAtom = Atom.make<readonly SessionSummary[]>([]).pipe(Atom.keepAlive)
export const settingsAtom = Atom.make<OwnerSettings | null>(null).pipe(Atom.keepAlive)
export const modelsAtom = Atom.make<readonly ModelInfo[]>([]).pipe(Atom.keepAlive)
export const providersAtom = Atom.make<readonly ProviderInfo[]>([]).pipe(Atom.keepAlive)
export const paletteAtom = Atom.make(false).pipe(Atom.keepAlive)

export const refreshSessions = () =>
  socket
    .request<readonly SessionSummary[]>("session.list")
    .then((sessions) => registry.set(sessionsAtom, sessions))
    .catch(() => undefined)

export const refreshSettings = () =>
  socket
    .request<OwnerSettings>("settings.get")
    .then((settings) => registry.set(settingsAtom, settings))
    .catch(() => undefined)

export const refreshModels = () =>
  Promise.all([
    http<{ providers: readonly ProviderInfo[] }>("/api/providers"),
    socket.request<readonly ModelInfo[]>("models.list"),
  ])
    .then(([{ providers }, models]) => {
      const configured = new Set(providers.filter((provider) => provider.configured).map((provider) => provider.id))
      registry.set(providersAtom, providers)
      registry.set(
        modelsAtom,
        models.filter((model) => configured.has(model.provider)),
      )
    })
    .catch(() => undefined)

export async function updateSettings(patch: Partial<Omit<OwnerSettings, "updatedAt">>): Promise<void> {
  registry.set(settingsAtom, await socket.request<OwnerSettings>("settings.update", { patch }))
}

export function startData(): void {
  void refreshSessions()
  void refreshSettings()
  void refreshModels()
  socket.onState((state) => {
    if (state === "open") void refreshSessions()
  })
}

export const modelSpec = (model: Pick<ModelInfo, "provider" | "id">) => `${model.provider}/${model.id}`

export const useSessions = () => useAtomValue(sessionsAtom)
export const useSettings = () => useAtomValue(settingsAtom)
export const useModels = () => useAtomValue(modelsAtom)
export const useProviders = () => useAtomValue(providersAtom)
