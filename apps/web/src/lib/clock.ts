import { createSignal } from "solid-js"

const [now, setNow] = createSignal(Date.now())
setInterval(() => setNow(Date.now()), 1000)
export { now }
