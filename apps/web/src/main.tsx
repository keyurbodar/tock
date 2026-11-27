import "./styles/app.css"
import { render } from "@solidjs/web"
import { installFluidHover, installGrow } from "@tock/motion"
import { App } from "./app"

render(() => <App />, document.getElementById("app")!)
installFluidHover()
installGrow()
