import { createSignal } from "solid-js"

const MINUTE = 60_000

/** Seconds, for live labels only ("Working for 12s"). */
const [now, setNow] = createSignal(Date.now())
setInterval(() => setNow(Date.now()), 1000)

/** Minutes, on the minute, for relative times ("3m", "2h") and anything that never shows seconds. */
const [minute, setMinute] = createSignal(Date.now())
const tick = () => {
  setMinute(Date.now())
  setTimeout(tick, MINUTE - (Date.now() % MINUTE))
}
setTimeout(tick, MINUTE - (Date.now() % MINUTE))

export { minute, now }
