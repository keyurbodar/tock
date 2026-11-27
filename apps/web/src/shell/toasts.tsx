import { Show } from "solid-js"
import { createToaster, Toast, ToastAction, ToastClose, ToastDescription, ToastRegion, ToastTitle } from "@ui-sdk/solid/toast"
import { Icon, type IconName } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"

export type Tone = "done" | "mono" | "failed" | "working" | "needs" | "rose"

interface Look {
  readonly tone: Tone
  readonly icon: IconName | "spin"
}

const toaster = createToaster()

/** One toast for every confirmation, after TDS PxFeedback: a tinted icon, a title, an optional line and one action. */
export function toast(title: string, options: { description?: string; tone?: Tone; icon?: IconName | "spin"; duration?: number; action?: { label: string; run: () => void }; id?: string } = {}) {
  const look: Look = { tone: options.tone ?? "done", icon: options.icon ?? "check" }
  return toaster({
    id: options.id,
    title,
    description: options.description,
    duration: options.duration ?? tokens.motion.toast.default,
    data: look,
    action: options.action ? { label: options.action.label, onAction: options.action.run } : undefined,
  })
}

export const updateToast = (id: string, title: string, options: { description?: string; tone?: Tone; icon?: IconName | "spin"; duration?: number } = {}) =>
  toaster.update(id, { title, description: options.description ?? "", duration: options.duration ?? tokens.motion.toast.default, data: { tone: options.tone ?? "done", icon: options.icon ?? "check" }, action: undefined })

export function Toasts() {
  return (
    <ToastRegion toaster={toaster} side="top" align="end" class="tds-toasts" aria-label="Notifications">
      {(item) => (
        <Toast class="tds-toast tds-over">
          <span class={`tds-tint tds-tint-${(item.data as Look).tone} size-toast-icon`}>
            <Show when={(item.data as Look).icon !== "spin"} fallback={<span class="tds-spinner" />}>
              <Icon name={(item.data as Look).icon as IconName} size="toast" />
            </Show>
          </span>
          <span class="tds-toast-body">
            <ToastTitle class="tds-toast-title" />
            <Show when={item.description}>
              <ToastDescription class="tds-toast-line" />
            </Show>
          </span>
          <Show when={item.action}>
            <ToastAction class="tds-toast-action tds-press" />
          </Show>
          <ToastClose class="tds-toast-close" aria-label="Close">
            <Icon name="x" size="chip" />
          </ToastClose>
        </Toast>
      )}
    </ToastRegion>
  )
}
