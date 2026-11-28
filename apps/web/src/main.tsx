import "./styles/app.css"
import { render } from "@solidjs/web"
import { installEdgeFade, installFluidHover, installGrow, installTooltips } from "@tock/ui/motion"
import { App } from "./app"
import { reportVitals } from "./lib/vitals"
import { trackModality } from "./lib/modality"
import { installServiceWorker } from "./lib/update"

trackModality()
render(() => <App />, document.getElementById("app")!)
installFluidHover()
installGrow()
installEdgeFade()
installTooltips()
reportVitals()
if (import.meta.env.PROD) installServiceWorker()
