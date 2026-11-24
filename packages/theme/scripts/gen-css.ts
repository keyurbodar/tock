import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { tokensCss } from "../src/css"

writeFileSync(join(import.meta.dir, "../src/tokens.css"), tokensCss())
