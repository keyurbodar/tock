import { cases } from "../case"
import { renderMarkdown } from "../../src/markdown"
import { MarkdownCode } from "../../src/markdown-code"
import { MarkdownGallery, MarkdownImage, MarkdownImageView, rememberImageSize } from "../../src/markdown-gallery"
import { MarkdownMermaid } from "../../src/markdown-mermaid"

const TABLE = `| Element | State | Tool | Notes |
| --- | --- | --- | --- |
| Bar chart | Live | \`show_visual\` | 6 months, 3 series |
| Tabs | Live | \`show_visual\` | Revenue / Units |
| Legend | Live | \`show_visual\` | 3 chart slots |
| Dither grid | Live | \`show_visual\` | Bayer 4×4 |
| Markdown | Live | \`message_user\` | This message |`

const SHOT = "/api/files/file_BD7XF0BMYRF9WA28WZQ5SWFTYK"
rememberImageSize(SHOT, { width: 1280, height: 900 })

export default cases("Markdown", [
  [
    "R5infkhiI4|[data-slot=markdown-gallery]|0",
    "single image of known size in the media box",
    () => (
      <MarkdownImageView value={() => {}}>
        <MarkdownGallery>
          <MarkdownImage src={SHOT} alt="Dithered visual style, dark theme" />
        </MarkdownGallery>
      </MarkdownImageView>
    ),
  ],
  [
    "pLhSrUNX0g|[data-component=markdown-code]|1",
    "plain text code block with wrap and copy",
    () => <MarkdownCode text="0x9449f363443EcfcFd6B85C82F584F652BEd7c5C2" complete blockKey="parity" />,
  ],
  [
    "pLhSrUNX0g|[data-component=markdown-mermaid]|1",
    "mermaid block showing its source before the diagram is drawn",
    () => <MarkdownMermaid text={"flowchart LR\n  A[Data] --> B[Scale]\n  B --> C[Render]\n  C --> D[Visual]"} complete />,
  ],
  ["pLhSrUNX0g|[data-slot=markdown-table]|1", "table inside its scroll wrapper", () => <>{renderMarkdown(TABLE)}</>],
])
