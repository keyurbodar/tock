import { render } from "@solidjs/web"
import { App } from "./App"

const root = document.getElementById("root")

if (!root) {
  throw new Error("missing root element")
}

render(() => <App />, root)
