import { createSignal } from "solid-js"
import { tokens } from "@tock/tokens"

const query = matchMedia(`(width < ${tokens.size.narrow}px)`)
const [narrow, setNarrow] = createSignal(query.matches)
query.addEventListener("change", () => setNarrow(query.matches))

/** Below this width the rail, sidebar and chat cannot all fit, so the shell shows the list on home and the chat alone on a thread. */
export { narrow }
