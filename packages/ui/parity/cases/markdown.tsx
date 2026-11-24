import { cases } from "../case"
import { renderMarkdown } from "../../src/markdown"
import { MarkdownCode } from "../../src/markdown-code"

const TABLE = `| Element | State | Tool | Notes |
| --- | --- | --- | --- |
| Bar chart | Live | \`show_visual\` | 6 months, 3 series |
| Tabs | Live | \`show_visual\` | Revenue / Units |
| Legend | Live | \`show_visual\` | 3 chart slots |
| Dither grid | Live | \`show_visual\` | Bayer 4×4 |
| Markdown | Live | \`message_user\` | This message |`

export default cases("Markdown", [
  [
    "pLhSrUNX0g|[data-component=markdown-code]|1",
    "plain text code block with wrap and copy",
    () => <MarkdownCode text="0x9449f363443EcfcFd6B85C82F584F652BEd7c5C2" complete blockKey="parity" />,
  ],
  ["pLhSrUNX0g|[data-slot=markdown-table]|1", "table inside its scroll wrapper", () => <>{renderMarkdown(TABLE)}</>],
])
