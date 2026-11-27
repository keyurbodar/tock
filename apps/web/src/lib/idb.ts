const DB = "tock"
const VERSION = 1
const STORES = ["sessions", "threads", "drafts", "outbox"] as const
export type StoreName = (typeof STORES)[number]

let opening: Promise<IDBDatabase | null> | undefined

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null)
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return opening
}

function run<T>(store: StoreName, mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined)
        const tx = db.transaction(store, mode)
        const req = act(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
      }),
  )
}

export const idb = {
  get: <T>(store: StoreName, key: string) => run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>),
  put: (store: StoreName, key: string, value: unknown) => run(store, "readwrite", (s) => s.put(value, key)),
  del: (store: StoreName, key: string) => run(store, "readwrite", (s) => s.delete(key)),
  all: <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>).then((values) => values ?? []),
}
