import { createSignal, Show } from "solid-js"
import { createMenuController, Menu, MenuContent, MenuItem, MenuItemIcon, MenuSeparator } from "@ui-sdk/solid/menu"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@ui-sdk/solid/alert-dialog"
import { useNavigate, useParams } from "@solidjs/router"
import { Icon, type IconName } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { deleteThread, titleOf, updateThread, type Session } from "../state/app"
import { toast, updateToast } from "./toasts"

export const threadMenu = createMenuController<Session>()

const [renaming, setRenaming] = createSignal<string>()
export { renaming, setRenaming }

function Item(props: { value: string; icon: IconName; label: string; danger?: boolean }) {
  return (
    <MenuItem value={props.value} class="tds-menu-item" data-danger={props.danger ? "" : undefined}>
      <MenuItemIcon class="tds-menu-icon">
        <Icon name={props.icon} size="menu" />
      </MenuItemIcon>
      {props.label}
    </MenuItem>
  )
}

export function ThreadMenu() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const [doomed, setDoomed] = createSignal<Session>()

  const run = (action: string) => {
    const session = threadMenu.getPayload()
    if (!session) return
    if (action === "rename") setRenaming(session.id)
    const title = titleOf(session)
    if (action === "pin") {
      void updateThread(session.id, { pinned: !session.meta.pinned })
      toast(session.meta.pinned ? "Unpinned" : "Pinned", { description: title, tone: "rose", icon: session.meta.pinned ? "push-pin-slash" : "push-pin" })
    }
    if (action === "unread") void updateThread(session.id, { unread: !session.meta.unread })
    if (action === "archive") {
      const archived = !session.meta.archived
      if (archived && params.id === session.id) navigate("/")
      void updateThread(session.id, { archived })
      const id = toast(archived ? "Archived" : "Restored", {
        description: title,
        tone: archived ? "mono" : "done",
        icon: archived ? "archive" : "arrow-counter-clockwise",
        duration: tokens.motion.toast.undo,
        action: archived ? { label: "Undo", run: () => (void updateThread(session.id, { archived: false }), updateToast(id, "Restored", { description: title, icon: "arrow-counter-clockwise" })) } : undefined,
      })
    }
    if (action === "link") {
      const url = `${location.origin}/t/${session.id}`
      void navigator.clipboard.writeText(url).then(() => toast("Link copied", { description: url.replace(/^https?:\/\//, ""), id: "copy", duration: tokens.motion.toast.copy }))
    }
    if (action === "delete") setDoomed(session)
  }

  const confirmDelete = (session: Session) => {
    if (params.id === session.id) navigate("/")
    void deleteThread(session.id)
    toast("Deleted forever", { description: titleOf(session), tone: "failed", icon: "trash" })
  }

  return (
    <>
      <Menu controller={threadMenu} onAction={(value) => run(String(value))}>
        <MenuContent<Session> class="tds-menu" align="start" sideOffset={tokens.size["menu-offset"]}>
          {(state) => (
            <Show when={state.payload}>
              {(session) => (
                <>
                  <Item value="rename" icon="pencil-simple" label="Rename" />
                  <Item value="pin" icon={session().meta.pinned ? "push-pin-slash" : "push-pin"} label={session().meta.pinned ? "Unpin" : "Pin"} />
                  <Item value="unread" icon="circle" label={session().meta.unread ? "Mark as Read" : "Mark as Unread"} />
                  <Item value="link" icon="link-simple" label="Copy Link" />
                  <MenuSeparator class="tds-menu-sep" />
                  <Item value="archive" icon="archive" label={session().meta.archived ? "Unarchive" : "Archive"} />
                  <Item value="delete" icon="trash" label="Delete" danger />
                </>
              )}
            </Show>
          )}
        </MenuContent>
      </Menu>

      <AlertDialog
        open={doomed() !== undefined}
        onOpenChange={(open, details) => {
          if (open) return
          const session = doomed()
          setDoomed(undefined)
          if (session && details.returnValue === "confirm") confirmDelete(session)
        }}
      >
        <AlertDialogBackdrop class="tds-scrim" />
        <AlertDialogContent class="tds-dialog">
          <img src="/brand/toast-mascot-36.svg" alt="" class="tds-dialog-mascot" draggable={false} />
          <AlertDialogTitle class="tds-dialog-title">Delete “{titleOf(doomed())}”?</AlertDialogTitle>
          <AlertDialogDescription class="tds-dialog-text">The chat and everything toast did in it are removed for good.</AlertDialogDescription>
          <div class="tds-dialog-actions">
            <AlertDialogClose class="tds-button tds-press">Cancel</AlertDialogClose>
            <AlertDialogClose value="confirm" class="tds-button tds-press" data-danger="">
              Delete
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
