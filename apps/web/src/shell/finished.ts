import { tokens } from "@tock/tokens"
import { animate } from "@tock/motion"
import { toast } from "./toasts"

const d = tokens.motion.duration
const s = tokens.size

const rowMark = (chat: string) => document.querySelector<HTMLElement>('.tds-row[href="/t/' + CSS.escape(chat) + '"] .tds-row-mark')

/** TDS px4 "finished": a chat you are not looking at finishes, so a toast says so, then turns into a dot that arcs into that chat's row and marks it unread. */
export function finishedElsewhere(chat: string, title: string, body: string, markUnread: () => void) {
  const id = "finished:" + chat
  toast(title, { description: body, id, duration: d["finished-hold"] })
  setTimeout(() => {
    const from = [...document.querySelectorAll<HTMLElement>(".tds-toast")].find((el) => el.querySelector(".tds-toast-title")?.textContent === title)
    const mark = rowMark(chat)
    if (!from || !mark || from.matches(":hover")) return markUnread()
    const a = from.getBoundingClientRect()
    const b = mark.getBoundingClientRect()
    const x0 = a.x + s["flight-toast-x"]
    const y0 = a.y + s["flight-toast-y"]
    const x1 = b.x + b.width / 2
    const y1 = b.y + b.height / 2
    const steps = 20
    const frames = Array.from({ length: steps + 1 }, (_, k) => {
      const e = 1 - Math.pow(1 - k / steps, 3)
      return { left: x0 + (x1 - x0) * e + "px", top: y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * s["flight-arc"] + "px", transform: "scale(" + (1.2 - 0.3 * e) + ")" }
    })
    const dot = document.createElement("i")
    dot.className = "tds-flight-dot"
    dot.dataset.chat = chat
    document.body.append(dot)
    animate(dot, frames, { duration: d.flight, easing: "linear", fill: "forwards" }).onfinish = () => {
      dot.remove()
      markUnread()
      requestAnimationFrame(() => {
        const landed = rowMark(chat)
        if (landed) animate(landed, [{ scale: 0.4 }, { scale: 1.4 }, { scale: 1 }], { duration: d["dot-pop"] })
      })
    }
  }, d["finished-hold"])
}
