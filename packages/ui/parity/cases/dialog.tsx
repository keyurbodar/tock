import { cases } from "../case"
import { Button } from "../../src/button"
import { Dialog, DialogBody, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../src/dialog"

export default cases("Dialog", [
  [
    "DVw98rtMsf|[data-slot=dialog-header]|0",
    "header with title, description and close",
    () => (
      <Dialog open>
        <DialogHeader>
          <DialogTitle>Environment variables</DialogTitle>
          <DialogDescription>Values go to this thread's machines and never appear in the conversation</DialogDescription>
        </DialogHeader>
      </Dialog>
    ),
  ],
  [
    "DVw98rtMsf|[data-slot=dialog-body]|0",
    "relaxed body",
    () => (
      <DialogBody spacing="relaxed">
        <p className="text-sm font-normal text-muted-foreground-1">Sections in a relaxed body sit on a 16px gap with 20px vertical padding</p>
        <p className="text-sm font-normal text-muted-foreground-1">The base body keeps the tighter 12px gap and 16px padding</p>
      </DialogBody>
    ),
  ],
  [
    "DVw98rtMsf|[data-slot=dialog-footer]|0",
    "footer with cancel and confirm",
    () => (
      <Dialog open>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button>Send</Button>
        </DialogFooter>
      </Dialog>
    ),
  ],
])
