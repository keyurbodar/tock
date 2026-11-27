import "./styles/app.css"
import { render } from "@solidjs/web"
import { installEdgeFade, installFluidHover, installGrow } from "@tock/ui/motion"
import { App } from "./app"

render(() => <App />, document.getElementById("app")!)
installFluidHover()
installGrow()
installEdgeFade()
