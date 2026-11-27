import { createSignal, Show } from "solid-js"
import { MorphIcon } from "@tock/ui/morph-icon"
import { createMenuController, Menu, MenuContent, MenuItem, MenuItemIcon, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from "@ui-sdk/solid/menu"
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
import { app, deleteThread, pinThread, titleOf, updateThread, type Session } from "../state/app"
import { isToastOpen, toast, updateToast } from "./toasts"

export const threadMenu = createMenuController<Session>()

const [renaming, setRenaming] = createSignal<string>()
export { renaming, setRenaming }

/** Rows chosen with ⌘/Ctrl or Shift click, for the bulk bar. */
export const [selected, setSelected] = createSignal<readonly string[]>([])
/** Chats deleted in the last ten seconds: hidden now, gone for good when the Undo toast runs out. */
export const [doomed, setDoomed] = createSignal<readonly string[]>([])
export const [moving, setMoving] = createSignal<Session>()

const entering = new Set<string>()
/** True once for a chat coming back into the list (unpin, undo), so its row can grow back in. */
export const takeEntering = (id: string) => entering.delete(id)
const markEntering = (ids: readonly string[]) => ids.forEach((id) => entering.add(id))

let flight: { id: string; from: DOMRect; glyph: string } | undefined
/** Where a pinned chat's glyph flew from, read once by the pin circle it lands in. */
export function takeFlight(id: string) {
  const found = flight?.id === id ? flight : undefined
  if (found) flight = undefined
  return found
}

type Go = (to: string) => void

const wrapOf = (id: string) => document.querySelector<HTMLElement>(`.tds-row-wrap[data-id="${id}"]`)

/**
 * Fade the leaving rows, remove them, then slide the rows below up into the gap (FLIP), as TDS px2 collapse().
 * Heights stay put so the virtual list never measures a folded row.
 */
export function leaveList(ids: readonly string[], then: () => void) {
  const wraps = ids.map(wrapOf).filter((wrap): wrap is HTMLElement => wrap !== null)
  if (!wraps.length) return then()
  const { layout, exit } = tokens.motion.duration
  const before = new Map([...document.querySelectorAll<HTMLElement>(".tds-row-wrap")].map((wrap) => [wrap.dataset.id, wrap.getBoundingClientRect().top]))
  let left = wraps.length
  const done = () => {
    then()
    requestAnimationFrame(() => {
      for (const wrap of wraps) {
        wrap.getAnimations().forEach((animation) => animation.cancel())
        wrap.removeAttribute("data-swiping")
        wrap.removeAttribute("data-leaving")
        wrap.dataset.go = ""
        const row = wrap.querySelector<HTMLElement>(".tds-row")
        if (row) Object.assign(row.style, { transform: "", transition: "" })
        wrap.querySelectorAll<HTMLElement>(".tds-swipe-side").forEach((side) => (side.style.width = ""))
      }
      for (const wrap of document.querySelectorAll<HTMLElement>(".tds-row-wrap")) {
        const from = before.get(wrap.dataset.id)
        const delta = from === undefined ? 0 : from - wrap.getBoundingClientRect().top
        if (delta) wrap.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: layout, easing: tokens.motion.curve.std })
      }
    })
  }
  for (const wrap of wraps) wrap.setAttribute("data-leaving", "")
  for (const wrap of wraps) wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: exit, easing: tokens.motion.curve.out, fill: "forwards" }).onfinish = () => --left || done()
}

export function pin(session: Session, from?: { rect: DOMRect; glyph: string }) {
  const icon = from ? undefined : wrapOf(session.id)?.querySelector(".tds-row-icon")
  const source = from ?? (icon ? { rect: icon.getBoundingClientRect(), glyph: icon.innerHTML } : undefined)
  if (source) flight = { id: session.id, from: source.rect, glyph: source.glyph }
  leaveList([session.id], () => void pinThread(session.id))
  toast("Pinned", { description: titleOf(session), tone: "rose", icon: "push-pin" })
}

export function unpin(session: Session) {
  markEntering([session.id])
  void updateThread(session.id, { pinned: false })
}

const leave = (ids: readonly string[], current: string | undefined, navigate: Go) => {
  if (current && ids.includes(current)) navigate("/")
}

const archivedBatch = new Set<string>()

export function archive(sessions: readonly Session[], current: string | undefined, navigate: Go) {
  const ids = sessions.map((session) => session.id)
  leave(ids, current, navigate)
  leaveList(ids, () => ids.forEach((id) => void updateThread(id, { archived: true })))
  if (!isToastOpen("archive")) archivedBatch.clear()
  ids.forEach((thread) => archivedBatch.add(thread))
  const batch = [...archivedBatch]
  const many = batch.length > 1
  toast(many ? `Archived ${batch.length} chats` : "Archived", {
    id: "archive",
    description: many ? "Undo brings them all back" : titleOf(sessions[0]),
    tone: "mono",
    icon: "archive",
    duration: tokens.motion.toast.undo,
    action: {
      label: "Undo",
      run: () => {
        archivedBatch.clear()
        markEntering(batch)
        batch.forEach((thread) => void updateThread(thread, { archived: false }))
        updateToast("archive", many ? `Restored ${batch.length} chats` : "Restored", { description: many ? undefined : titleOf(sessions[0]), icon: "arrow-counter-clockwise" })
      },
    },
  })
}

export function remove(sessions: readonly Session[], current: string | undefined, navigate: Go) {
  const ids = sessions.map((session) => session.id)
  leave(ids, current, navigate)
  leaveList(ids, () => setDoomed((list) => [...list, ...ids]))
  const many = ids.length > 1
  const timer = setTimeout(() => {
    const still = ids.filter((thread) => doomed().includes(thread))
    setDoomed((list) => list.filter((thread) => !ids.includes(thread)))
    still.forEach((thread) => void deleteThread(thread))
  }, tokens.motion.toast.delete)
  const id = toast(many ? `Deleted ${ids.length} chats` : "Deleted", {
    description: many ? "You have 10 seconds to undo" : titleOf(sessions[0]),
    tone: "failed",
    icon: "trash",
    duration: tokens.motion.toast.delete,
    action: {
      label: "Undo",
      run: () => {
        clearTimeout(timer)
        markEntering(ids)
        setDoomed((list) => list.filter((thread) => !ids.includes(thread)))
        updateToast(id, "Restored", { description: many ? `${ids.length} chats are back` : titleOf(sessions[0]), icon: "arrow-counter-clockwise" })
      },
    },
  })
}

export const markRead = (sessions: readonly Session[]) => sessions.forEach((session) => void updateThread(session.id, { unread: false }))

const HOUR = 3_600_000
const snoozes: Record<string, { label: string; until: () => number }> = {
  hour: { label: "for an hour", until: () => Date.now() + HOUR },
  tonight: {
    label: "until tonight",
    until: () => {
      const at = new Date()
      at.setHours(19, 0, 0, 0)
      return at.getTime() > Date.now() ? at.getTime() : at.getTime() + 24 * HOUR
    },
  },
  tomorrow: {
    label: "until tomorrow",
    until: () => {
      const at = new Date(Date.now() + 24 * HOUR)
      at.setHours(9, 0, 0, 0)
      return at.getTime()
    },
  },
  week: {
    label: "until next week",
    until: () => {
      const at = new Date()
      at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7))
      at.setHours(9, 0, 0, 0)
      return at.getTime()
    },
  },
}

export function snooze(session: Session, which: string, current: string | undefined, navigate: Go) {
  const pick = snoozes[which]
  if (!pick) return
  leave([session.id], current, navigate)
  leaveList([session.id], () => void updateThread(session.id, { snoozedUntil: pick.until() }))
  const id = toast(`Snoozed ${pick.label}`, {
    description: titleOf(session),
    tone: "needs",
    icon: "bell-slash",
    action: { label: "Undo", run: () => (markEntering([session.id]), void updateThread(session.id, { snoozedUntil: null }), updateToast(id, "Back in the list", { description: titleOf(session), icon: "arrow-counter-clockwise" })) },
  })
}

/** Rename, pin, unread, archive and copy link: shared by the row menu, swipes and the keyboard shortcuts. */
export function threadAction(action: string, session: Session, current: string | undefined, navigate: Go) {
  if (action === "rename") setRenaming(session.id)
  if (action === "pin") session.meta.pinned ? unpin(session) : pin(session)
  if (action === "unread") void updateThread(session.id, { unread: !session.meta.unread })
  if (action === "archive") session.meta.archived ? (markEntering([session.id]), void updateThread(session.id, { archived: false })) : archive([session], current, navigate)
  if (action === "delete") remove([session], current, navigate)
  if (action === "move") setMoving(session)
  if (action.startsWith("snooze:")) snooze(session, action.slice("snooze:".length), current, navigate)
  if (action === "link") {
    const url = `${location.origin}/t/${session.id}`
    void navigator.clipboard.writeText(url).then(() => toast("Link copied", { description: url.replace(/^https?:\/\//, ""), id: "copy", duration: tokens.motion.toast.copy }))
  }
}

function Item(props: { value: string; icon?: IconName; label: string; danger?: boolean; keys?: string }) {
  return (
    <MenuItem value={props.value} class="tds-menu-item" data-danger={props.danger ? "" : undefined}>
      <Show when={props.icon}>
        {(icon) => (
          <MenuItemIcon class="tds-menu-icon">
            <MorphIcon name={icon()} size="menu" />
          </MenuItemIcon>
        )}
      </Show>
      {props.label}
      <Show when={props.keys}>
        <span class="tds-menu-keys">{props.keys}</span>
      </Show>
    </MenuItem>
  )
}

const bulk = (session: Session) => selected().length > 1 && selected().includes(session.id)
const chosen = () => app.sessions.filter((session) => selected().includes(session.id))

export function ThreadMenu() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const [forever, setForever] = createSignal<Session>()

  const run = (action: string) => {
    const session = threadMenu.getPayload()
    if (!session) return
    if (action === "bulk:archive") return archive(chosen(), params.id, navigate), setSelected([])
    if (action === "bulk:read") return markRead(chosen()), setSelected([])
    if (action === "bulk:delete") return remove(chosen(), params.id, navigate), setSelected([])
    if (action === "forever") return setForever(session)
    threadAction(action, session, params.id, navigate)
  }

  const confirmForever = (session: Session) => {
    const id = toast("Deleting", { description: titleOf(session), tone: "failed", icon: "spin", hold: true })
    void Promise.resolve(deleteThread(session.id)).then(
      () => updateToast(id, "Deleted forever", { description: titleOf(session), tone: "failed", icon: "trash" }),
      () => updateToast(id, "Couldn’t delete", { description: titleOf(session), tone: "failed", icon: "warning-circle", duration: tokens.motion.toast.error }),
    )
  }

  return (
    <>
      <Menu controller={threadMenu} onAction={(value) => run(String(value))}>
        <MenuContent<Session> class="tds-menu tds-over" align="start" sideOffset={tokens.size["menu-offset"]}>
          {(state) => (
            <Show when={state.payload}>
              {(session) => (
                <Show
                  when={!bulk(session())}
                  fallback={
                    <>
                      <Item value="bulk:archive" icon="archive" label={`Archive ${selected().length} Chats`} />
                      <Item value="bulk:read" icon="circle" label="Mark as Read" />
                      <MenuSeparator class="tds-menu-sep" />
                      <Item value="bulk:delete" icon="trash" label={`Delete ${selected().length} Chats`} danger />
                    </>
                  }
                >
                  <Show
                    when={!session().meta.archived}
                    fallback={
                      <>
                        <Item value="archive" icon="arrow-counter-clockwise" label="Unarchive" />
                        <MenuSeparator class="tds-menu-sep" />
                        <Item value="forever" icon="trash" label="Delete Forever…" danger />
                      </>
                    }
                  >
                    <Item value="rename" icon="pencil-simple" label="Rename…" keys="↩" />
                    <Item value="pin" icon={session().meta.pinned ? "push-pin-slash" : "push-pin"} label={session().meta.pinned ? "Unpin" : "Pin"} />
                    <Item value="unread" icon="circle" label={session().meta.unread ? "Mark as Read" : "Mark as Unread"} keys="⌘U" />
                    <MenuSub delay={tokens.motion.duration["submenu-rest"]}>
                      <MenuSubTrigger class="tds-menu-item tds-menu-sub">
                        <span class="tds-menu-icon">
                          <Icon name="bell-slash" size="menu" />
                        </span>
                        Snooze
                        <Icon name="caret-right" size="chip" class="tds-menu-caret" />
                      </MenuSubTrigger>
                      <MenuSubContent class="tds-menu tds-menu-subcontent tds-over">
                        <Item value="snooze:hour" label="1 Hour" />
                        <Item value="snooze:tonight" label="Tonight" />
                        <Item value="snooze:tomorrow" label="Tomorrow" />
                        <Item value="snooze:week" label="Next Week" />
                      </MenuSubContent>
                    </MenuSub>
                    <Item value="move" icon="folder-simple" label="Move to…" />
                    <Item value="link" icon="link-simple" label="Copy Link" />
                    <MenuSeparator class="tds-menu-sep" />
                    <Item value="archive" icon="archive" label="Archive" keys="⌘E" />
                    <Item value="delete" icon="trash" label="Delete" danger />
                  </Show>
                </Show>
              )}
            </Show>
          )}
        </MenuContent>
      </Menu>

      <AlertDialog
        open={forever() !== undefined}
        onOpenChange={(open, details) => {
          if (open) return
          const session = forever()
          setForever(undefined)
          if (session && details.returnValue === "confirm") confirmForever(session)
        }}
      >
        <AlertDialogBackdrop class="tds-scrim" />
        <AlertDialogContent class="tds-dialog tds-over">
          <img src="/brand/toast-mascot-36.svg" alt="" class="tds-dialog-mascot" draggable={false} />
          <AlertDialogTitle class="tds-dialog-title">Delete “{titleOf(forever())}” forever?</AlertDialogTitle>
          <AlertDialogDescription class="tds-dialog-text">Its messages and files go too. You can’t undo this.</AlertDialogDescription>
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
