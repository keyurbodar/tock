import { cases } from "../case"
import { MessageAction, MessageFooter } from "../../src/chat/message"
import { glyphs } from "../../src/glyph"

export default cases("Message", [
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
