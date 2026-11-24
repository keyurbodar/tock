import { cases } from "../case"
import { Duration } from "../../src/chat/step"
import { ToastCard } from "../../src/toast"

const noop = () => {}
const download = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M19 18.584C20.7659 17.8124 22 16.0503 22 14C22 11.2386 19.7614 9 17 9C16.4547 9 15.9299 9.08728 15.4386 9.24864C14.3696 6.75042 11.8892 5 9 5C5.13401 5 2 8.13401 2 12C2 14.3787 3.18652 16.4804 5 17.7453M12 14V19.25M14.5 17.5L12 20L9.5 17.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default cases("Toast", [
  ["2JCTH_aSv9|[data-sonner-toast] div:has(> [data-sonner-content])|0", "error", () => <ToastCard id={1} type="error" title="Could not add Holy Night" />],
  ["98sXew1PAO|[data-sonner-toast] div:has(> [data-sonner-content])|0", "error with description", () => <ToastCard id={1} type="error" title="Failed to regenerate title" description="The thread is still running" />],
  [
    "AKMhJqfxOk|[data-sonner-toast] div:has(> [data-sonner-content])|0",
    "success with inline action",
    () => <ToastCard id={1} type="success" title="Project created" action={{ label: "Open project", onClick: noop }} />,
  ],
  [
    "P3uQKmhRmg|[data-sonner-toast] div:has(> [data-sonner-content])|0",
    "success with description and action",
    () => (
      <ToastCard
        id={1}
        type="success"
        title="Thread created"
        description="SCO-1234 running with Opus 5"
        action={{ label: "Open thread", onClick: noop }}
      />
    ),
  ],
  [
    "T7GKVupx4D|[data-sonner-toast] div:has(> [data-sonner-content])|0",
    "progress with action and cancel",
    () => (
      <ToastCard
        id={1}
        type="default"
        icon={download}
        title="Download started"
        description={
          <span>
            <Duration value="23%" />, 2 min left
          </span>
        }
        action={{ label: "Run in background", onClick: noop }}
        cancel={{ label: "Cancel" }}
      />
    ),
  ],
  [
    "rK0Ry93qKK|[data-sonner-toast] div:has(> [data-sonner-content])|0",
    "confirmation with action and cancel",
    () => (
      <ToastCard
        id={1}
        type="warning"
        title="Unsaved changes"
        description="You have made 4 edits"
        action={{ label: "Save changes", onClick: noop }}
        cancel={{ label: "Cancel" }}
      />
    ),
  ],
])
