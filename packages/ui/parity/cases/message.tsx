import { cases } from "../case"
import fixtures from "../fixtures/specimens.json"
import { AutomationMessage, MessageAction, MessageBubble, MessageFooter } from "../../src/chat/message"
import { glyphs } from "../../src/glyph"

const CLAMPED = "9kSoR-Dh7N|div:has(> [data-slot=clamped-body][style*=max-height]):has(> span.sr-only)|0"
const frameBody = (ref: keyof typeof fixtures) => /data-component="markdown">(.*)<\/div><\/div><\/div><span/s.exec(fixtures[ref].html)?.[1] ?? ""

const AUTOMATION = "pLhSrUNX0g|[data-slot=automation-message]|0"

export default cases("Message", [
  [
    "pLhSrUNX0g|[data-slot=automation-message]|0",
    "routine run with its header and a body clamped to four lines",
    () => (
      <AutomationMessage title="Crew watchdog: resume failed threads" detail="ran" time="3:21 PM" clamp={{ text: "x", expanded: false, onToggle: () => {} }}>
        <div className="" data-component="markdown" dangerouslySetInnerHTML={{ __html: frameBody(AUTOMATION) }} />
      </AutomationMessage>
    ),
    ["max-height"],
  ],
  [
    "9kSoR-Dh7N|div:has(> [data-slot=clamped-body][style*=max-height]):has(> span.sr-only)|0",
    "long user bubble clamped to 288px around the frame's own body",
    () => (
      <MessageBubble clamp={{ text: "x".repeat(421), expanded: false, onToggle: () => {} }}>
        <div className="" data-component="markdown" dangerouslySetInnerHTML={{ __html: frameBody(CLAMPED) }} />
      </MessageBubble>
    ),
  ],
  ["9kSoR-Dh7N#23", "footer with the time only", () => <MessageFooter time="7:27 PM" />],
  [
    "9kSoR-Dh7N#24",
    "user footer with time, reply, copy and edit",
    () => (
      <MessageFooter time="2:55 PM" touch>
        <MessageAction label="Reply">{glyphs.reply}</MessageAction>
        <MessageAction label="Copy message">{glyphs.copy}</MessageAction>
        <MessageAction label="Edit message">{glyphs.edit}</MessageAction>
      </MessageFooter>
    ),
  ],
])
