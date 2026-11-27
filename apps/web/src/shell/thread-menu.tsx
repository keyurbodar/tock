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
    if (action === "pin") void updateThread(session.id, { pinned: !session.meta.pinned })
    if (action === "unread") void updateThread(session.id, { unread: !session.meta.unread })
    if (action === "archive") void updateThread(session.id, { archived: !session.meta.archived })
    if (action === "link") void navigator.clipboard.writeText(`${location.origin}/t/${session.id}`)
    if (action === "delete") setDoomed(session)
  }

  const confirmDelete = (session: Session) => {
    if (params.id === session.id) navigate("/")
    void deleteThread(session.id)
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
