import { tokens } from "@tock/tokens"
import { toast } from "./toasts"

/** A chat you are not looking at finishes: a toast says so and the chat turns unread (its title goes bold). No flying dot: Keyur ruled it out of the style. */
export function finishedElsewhere(chat: string, title: string, body: string, markUnread: () => void) {
  toast(title, { description: body, id: "finished:" + chat, duration: tokens.motion.duration["finished-hold"] })
  markUnread()
}
