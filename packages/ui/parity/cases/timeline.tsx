import { cases } from "../case"
import { ErrorAlert } from "../../src/alert"
import { ChatStamp } from "../../src/timeline"

export default cases("Timeline", [
  ["pLhSrUNX0g|[data-slot=chat-stamp]|0", "chat stamp above a turn", () => <ChatStamp>Yesterday 1:26 PM</ChatStamp>],
  [
    "pLhSrUNX0g|[data-slot=alert]|0",
    "error alert with title and description",
    () => (
      <ErrorAlert title="Model error" code="LLM.Error.InvalidProviderOutput">
        The model provider returned an invalid response.
      </ErrorAlert>
    ),
  ],
])
