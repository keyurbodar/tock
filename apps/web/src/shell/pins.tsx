import { For, Show, untrack } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { createMenuController, Menu, MenuContent, MenuContextTrigger, MenuItem, MenuItemIcon } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { animate, morphFrom, watchLayout } from "@tock/ui/motion"
import { glyphFor } from "../lib/glyph"
import { dirOf } from "../lib/dir"
import { app, pinnedSessions, titleOf, updateThread, type Session } from "../state/app"
import { takeFlight, unpin } from "./thread-menu"
import { hidePeek, peekEnter, peekLeave } from "./peek"
import { Orb } from "@tock/ui/orb"
import { statusOf } from "../lib/status"

const pinStatus = (session: Session) => {
  const status = statusOf(session)
  return status === "working" || status === "needs" ? status : undefined
}
import { createSignal } from "solid-js"

const pinMenu = createMenuController<Session>()
const [renamingPin, setRenamingPin] = createSignal<string>()
export const [dropping, setDropping] = createSignal<"" | "over" | "near">("")

const ms = tokens.motion.duration

/** The strip's last height, so a reload reserves it while chats load and the rows below never jump when pins arrive. */
const PINS_HEIGHT = "tock.pins.height"
const reserved = () => Number(localStorage.getItem(PINS_HEIGHT)) || 0

/** The pins wrap into as many columns as the sidebar fits; when pins come, go or the columns change, every tile glides from where it was. */
function flow(box: HTMLElement) {
  const layout = watchLayout(box, ".tds-pin")
  const columns = new ResizeObserver(() => {
    if (!box.isConnected) {
      if (app.sessionsLoaded && pinnedSessions().length === 0) localStorage.removeItem(PINS_HEIGHT)
      return columns.disconnect()
    }
    if (box.querySelector(".tds-pin")) localStorage.setItem(PINS_HEIGHT, String(box.offsetHeight))
    box.style.setProperty("--pin-cols", String(Math.max(1, Math.floor(box.clientWidth / tokens.size["pin-slot-min"]))))
    layout.move()
  })
  columns.observe(box)
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
    animate(ghost, [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: ms["pin-flight"], easing: tokens.motion.curve.sheet, fill: "forwards" }).onfinish = () => {
      ghost.remove()
      circle.style.opacity = ""
      animate(circle, [{ scale: ".8" }, { scale: "1.08" }, { scale: "1" }], { duration: ms["pin-bounce"], easing: tokens.motion.curve.out })
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
    <Show when={renamingPin() === props.session.id} fallback={<span class="tds-pin-label" dir={dirOf(titleOf(props.session))}>{titleOf(props.session)}</span>}>
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
  const params = useParams<{ id?: string }>()
  const out = (session: Session, el: HTMLElement) => {
    animate(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.6)" }], { duration: ms.exit, easing: tokens.motion.curve.in, fill: "forwards" }).onfinish = () => unpin(session)
  }
  return (
    <>
    <Show when={props.show && !app.sessionsLoaded && pinnedSessions().length === 0 && reserved() > 0}>
      <div class="tds-pins" aria-busy="true" aria-label="Loading pinned chats" style={{ height: reserved() + "px" }} />
    </Show>
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
                <button type="button" class="tds-pin" onPointerEnter={(e) => peekEnter(untrack(session), e.currentTarget, "below")} onPointerLeave={() => peekLeave()} onPointerDown={() => hidePeek()} data-id={session().id} data-active={params.id === session().id ? "" : undefined} data-unread={session().meta.unread ? "" : undefined} aria-current={params.id === session().id ? "page" : undefined} aria-label={titleOf(session())} onClick={(e) => (morphFrom(e.currentTarget), navigate(`/t/${session().id}`))}>
                  <i class={`tds-pin-circle ${glyphFor(session().id).hue}`} ref={(el) => land(el, session().id)}>
                    <Icon name={glyphFor(session().id).icon} size="pin" />
                    <Show when={pinStatus(session())}>{(status) => <Orb status={status()} surface="side" size="orb-sm" class="tds-pin-status" />}</Show>
                  </i>
                  <PinLabel session={session()} />
                </button>
              </MenuContextTrigger>
            )}
          </For>
        </div>
        <MenuContent class="tds-menu tds-over" data-edge-fade="y">
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
    </>
  )
}
