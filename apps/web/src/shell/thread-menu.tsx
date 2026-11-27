import { createSignal, Show } from "solid-js"
import { MorphIcon } from "@tock/ui/morph-icon"
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
import { isToastOpen, toast, updateToast } from "./toasts"

const archivedBatch = new Set<string>()

export const threadMenu = createMenuController<Session>()

const [renaming, setRenaming] = createSignal<string>()
export { renaming, setRenaming }

function Item(props: { value: string; icon: IconName; label: string; danger?: boolean }) {
  return (
    <MenuItem value={props.value} class="tds-menu-item" data-danger={props.danger ? "" : undefined}>
      <MenuItemIcon class="tds-menu-icon">
        <MorphIcon name={props.icon} size="menu" />
      </MenuItemIcon>
      {props.label}
    </MenuItem>
  )
}

/** Rename, pin, unread, archive and copy link: shared by the row menu and the keyboard shortcuts. */
export function threadAction(action: string, session: Session, current: string | undefined, navigate: (to: string) => void) {
  if (action === "rename") setRenaming(session.id)
  const title = titleOf(session)
  if (action === "pin") {
    void updateThread(session.id, { pinned: !session.meta.pinned })
    toast(session.meta.pinned ? "Unpinned" : "Pinned", { description: title, tone: "rose", icon: session.meta.pinned ? "push-pin-slash" : "push-pin" })
  }
  if (action === "unread") void updateThread(session.id, { unread: !session.meta.unread })
  if (action === "archive") {
    const archived = !session.meta.archived
    if (archived && current === session.id) navigate("/")
    void updateThread(session.id, { archived })
    if (!archived) {
      toast("Restored", { description: title, icon: "arrow-counter-clockwise" })
      return
    }
    if (!isToastOpen("archive")) archivedBatch.clear()
    archivedBatch.add(session.id)
    toast("Archived", {
      id: "archive",
      group: "archive",
      plural: (count) => `Archived ${count} chats`,
      description: archivedBatch.size > 1 ? "Undo brings them all back" : title,
      tone: "mono",
      icon: "archive",
      duration: tokens.motion.toast.undo,
      action: {
        label: "Undo",
        run: () => {
          const ids = [...archivedBatch]
          archivedBatch.clear()
          ids.forEach((id) => void updateThread(id, { archived: false }))
          updateToast("archive", ids.length > 1 ? `Restored ${ids.length} chats` : "Restored", { description: ids.length > 1 ? undefined : title, icon: "arrow-counter-clockwise" })
        },
      },
    })
  }
  if (action === "link") {
    const url = `${location.origin}/t/${session.id}`
    void navigator.clipboard.writeText(url).then(() => toast("Link copied", { description: url.replace(/^https?:\/\//, ""), id: "copy", duration: tokens.motion.toast.copy }))
  }
}

export function ThreadMenu() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const [doomed, setDoomed] = createSignal<Session>()

  const run = (action: string) => {
    const session = threadMenu.getPayload()
    if (!session) return
    threadAction(action, session, params.id, navigate)
    if (action === "delete") setDoomed(session)
  }

  const confirmDelete = (session: Session) => {
    if (params.id === session.id) navigate("/")
    const id = toast("Deleting", { description: titleOf(session), tone: "failed", icon: "spin", hold: true })
    void Promise.resolve(deleteThread(session.id)).then(
      () => updateToast(id, "Deleted forever", { description: titleOf(session), tone: "failed", icon: "trash" }),
      () => updateToast(id, "Couldn’t delete", { description: titleOf(session), tone: "failed", icon: "warning-circle", duration: tokens.motion.toast.error }),
    )
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
