import { useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { socket } from "../api/socket"
import type { FileMeta } from "../api/types"
import { registry } from "./registry"

interface Files {
  readonly byId: ReadonlyMap<string, FileMeta>
  readonly settled: ReadonlySet<string>
}

const EMPTY: Files = { byId: new Map(), settled: new Set() }

const filesAtom = Atom.make(EMPTY).pipe(Atom.keepAlive)

const asked = new Set<string>()

export function rememberFile(meta: FileMeta): void {
  const current = registry.get(filesAtom)
  registry.set(filesAtom, { ...current, byId: new Map(current.byId).set(meta.id, meta) })
}

export function ensureFiles(ids: readonly string[]): void {
  const known = registry.get(filesAtom).byId
  const wanted = ids.filter((id) => !known.has(id) && !asked.has(id))
  if (wanted.length === 0) return
  for (const id of wanted) asked.add(id)
  socket
    .request<readonly FileMeta[]>("file.list")
    .catch((): readonly FileMeta[] => [])
    .then((files) => {
      const current = registry.get(filesAtom)
      registry.set(filesAtom, {
        byId: new Map([...current.byId, ...files.map((file): [string, FileMeta] => [file.id, file])]),
        settled: new Set([...current.settled, ...wanted]),
      })
    })
}

export const useFiles = () => useAtomValue(filesAtom)
