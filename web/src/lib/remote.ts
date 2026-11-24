import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

export function useRemote<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState(initial)
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(
    () =>
      load()
        .then(setData)
        .catch(() => undefined)
        .finally(() => setLoaded(true)),
    [load],
  )
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loaded, reload }
}

export async function act(run: () => Promise<unknown>, done?: string): Promise<boolean> {
  try {
    await run()
    if (done) toast(done)
    return true
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "Something went wrong")
    return false
  }
}
