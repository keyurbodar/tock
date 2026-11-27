import "./styles/app.css"
import { render } from "@solidjs/web"
import { installFluidHover } from "@tock/motion"
import { App } from "./app"

render(() => <App />, document.getElementById("app")!)
installFluidHover()
