import { For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createMenuController, Menu, MenuContent, MenuContextTrigger, MenuItem, MenuItemIcon } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { glyphFor } from "../lib/glyph"
import { pinnedSessions, titleOf, updateThread, type Session } from "../state/app"
import { takeFlight, unpin } from "./thread-menu"
import { createSignal } from "solid-js"

const pinMenu = createMenuController<Session>()
const [renamingPin, setRenamingPin] = createSignal<string>()
export const [dropping, setDropping] = createSignal<"" | "over" | "near">("")

const ms = tokens.motion.duration

/** The pins wrap into as many columns as the sidebar fits; when pins come, go or the columns change, every tile glides from where it was (FLIP). */
function flow(box: HTMLElement) {
  let cols = 0
  const at = new Map<string, { x: number; y: number }>()
  const tiles = () => [...box.querySelectorAll<HTMLElement>(".tds-pin")]
  const read = () => {
    at.clear()
    for (const el of tiles()) at.set(el.dataset.id ?? "", { x: el.offsetLeft, y: el.offsetTop })
  }
  const move = () => {
    for (const el of tiles()) {
      const was = at.get(el.dataset.id ?? "")
      if (!was) continue
      const dx = was.x - el.offsetLeft
      const dy = was.y - el.offsetTop
      if (dx || dy) el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: ms.layout, easing: tokens.motion.curve.sheet })
    }
    read()
  }
  const resize = new ResizeObserver(() => {
    if (!box.isConnected) return (resize.disconnect(), added.disconnect())
    const next = Math.max(1, Math.floor(box.clientWidth / tokens.size["pin-slot-min"]))
    if (next === cols) return read()
    cols = next
    box.style.setProperty("--pin-cols", String(next))
    move()
  })
  const added = new MutationObserver(move)
  resize.observe(box)
  added.observe(box, { childList: true })
}

/** The glyph leaves the row and lands in its circle on the sheet curve, then the circle settles .8 → 1.08 → 1, as TDS px2 pin(). */
function land(circle: HTMLElement, id: string) {
  const flight = takeFlight(id)
  if (!flight) return
  circle.style.opacity = "0"
  requestAnimationFrame(() => {
    const to = circle.getBoundingClientRect()
    const ghost = document.createElement("div")
    ghost.className = "tds-pin-ghost"
    ghost.innerHTML = flight.glyph
    Object.assign(ghost.style, { left: `${flight.from.left}px`, top: `${flight.from.top}px`, width: `${flight.from.width}px`, height: `${flight.from.height}px` })
    document.body.append(ghost)
    const dx = to.left + to.width / 2 - (flight.from.left + flight.from.width / 2)
    const dy = to.top + to.height / 2 - (flight.from.top + flight.from.height / 2)
    ghost.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: ms["pin-flight"], easing: tokens.motion.curve.sheet, fill: "forwards" }).onfinish = () => {
      ghost.remove()
      circle.style.opacity = ""
      circle.animate([{ scale: ".8" }, { scale: "1.08" }, { scale: "1" }], { duration: ms["pin-bounce"], easing: tokens.motion.curve.out })
    }
  })
}

function PinLabel(props: { session: Session }) {
  let done = false
  const commit = (value: string) => {
    if (done) return
    done = true
    setRenamingPin(undefined)
    const title = value.trim()
    if (title && title !== titleOf(props.session)) void updateThread(props.session.id, { title })
  }
  return (
    <Show when={renamingPin() === props.session.id} fallback={<span class="tds-pin-label">{titleOf(props.session)}</span>}>
      <input
        ref={(el) => queueMicrotask(() => (el.focus(), el.select()))}
        class="tds-pin-rename"
        value={titleOf(props.session)}
        aria-label="Pin name"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") commit(e.currentTarget.value)
          if (e.key === "Escape") ((done = true), setRenamingPin(undefined))
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
      />
    </Show>
  )
}

/** Pinned chats above the list, after TDS px2 renderPins (48 shaded circles, a 12 label, a 9 rose dot when unread) in a wrapping grid that reflows with the sidebar. */
export function Pins(props: { show: boolean }) {
  const navigate = useNavigate()
  const out = (session: Session, el: HTMLElement) => {
    el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.6)" }], { duration: ms.exit, easing: tokens.motion.curve.in, fill: "forwards" }).onfinish = () => unpin(session)
  }
  return (
    <Show when={props.show && (pinnedSessions().length > 0 || dropping() !== "")}>
      <Menu
        controller={pinMenu}
        onAction={(value) => {
          const session = pinMenu.getPayload()
          if (!session) return
          if (value === "unpin") {
            const el = document.querySelector<HTMLElement>(`.tds-pin[data-id="${session.id}"]`)
            return el ? out(session, el) : unpin(session)
          }
          if (value === "rename") setRenamingPin(session.id)
        }}
      >
        <div class="tds-pins" ref={flow} data-drop={dropping() === "over" ? "" : undefined} aria-label="Pinned chats">
          <For each={pinnedSessions()} keyed={(session) => session.id}>
            {(session) => (
              <MenuContextTrigger payload={session()} class="tds-pin-slot">
                <button type="button" class="tds-pin" data-id={session().id} aria-label={titleOf(session())} onClick={() => navigate(`/t/${session().id}`)}>
                  <i class={`tds-pin-circle ${glyphFor(session().id).hue}`} ref={(el) => land(el, session().id)}>
                    <Icon name={glyphFor(session().id).icon} size="pin" />
                  </i>
                  <PinLabel session={session()} />
                  <Show when={session().meta.unread}>
                    <b class="tds-pin-dot" />
                  </Show>
                </button>
              </MenuContextTrigger>
            )}
          </For>
        </div>
        <MenuContent class="tds-menu tds-over">
          <MenuItem value="unpin" class="tds-menu-item">
            <MenuItemIcon class="tds-menu-icon">
              <Icon name="push-pin-slash" size="menu" />
            </MenuItemIcon>
            Unpin
          </MenuItem>
          <MenuItem value="rename" class="tds-menu-item">
            <MenuItemIcon class="tds-menu-icon">
              <Icon name="pencil-simple" size="menu" />
            </MenuItemIcon>
            Rename…
          </MenuItem>
        </MenuContent>
      </Menu>
    </Show>
  )
}
