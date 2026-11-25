import { Dialog } from "@base-ui/react/dialog"
import { motion } from "@tock/theme/motion"
import {
  type ComponentProps,
  createContext,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"
import { cn } from "./cn"

const D = motion.drawer
const OVERLAY = "fixed inset-0 z-(--z-drawer) bg-overlay"
const CONTENT =
  "fixed inset-x-0 bottom-0 z-(--z-drawer) flex max-h-[calc(100dvh-96px)] flex-col rounded-t-(--radius-panel) border-x-[0.5px] border-t-[0.5px] border-border-2 bg-popover pb-(--safe-bottom) shadow-overlay"
const HANDLE =
  "group/drawer-handle flex w-full shrink-0 cursor-grab touch-none items-center justify-center py-3 outline-none group-data-[dragging]/drawer:cursor-grabbing"
const HANDLE_FOCUS = "focus-gutter -my-1 rounded-full py-1 group-focus-visible/drawer-handle:outline-ring-inset"
const HANDLE_BAR =
  "block h-1 w-9 rounded-full bg-muted transition-colors duration-100 group-hover/drawer-handle:bg-muted-foreground-3 group-active/drawer-handle:bg-muted-foreground-3"

const PHONE = "(max-width: 767px)"
const TOUCH = "(hover: none) and (pointer: coarse)"
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

const useMedia = (query: string) =>
  useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", notify)
      return () => list.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )

export const usePhoneLayout = () => useMedia(PHONE)

export function useTouchLayout() {
  const phone = useMedia(PHONE)
  const touch = useMedia(TOUCH)
  return phone && touch
}

interface DrawerState {
  readonly contentRef: RefObject<HTMLElement | null>
  readonly actionsRef: RefObject<Dialog.Root.Actions>
  readonly setContent: (element: HTMLElement | null) => void
  readonly setBackdrop: (element: HTMLElement | null) => void
  readonly pressBackdrop: () => void
}

const DrawerContext = createContext<DrawerState | null>(null)

export function Drawer({ onOpenChange, ...props }: ComponentProps<typeof Dialog.Root>) {
  const contentRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<Dialog.Root.Actions>({ unmount: () => {}, close: () => {} })
  const pressed = useRef(false)
  const state = useMemo<DrawerState>(
    () => ({
      contentRef,
      actionsRef,
      setContent: (element) => {
        contentRef.current = element
      },
      setBackdrop: (element) => {
        if (element !== null) pressed.current = false
      },
      pressBackdrop: () => {
        pressed.current = true
      },
    }),
    [],
  )
  return (
    <DrawerContext.Provider value={state}>
      <Dialog.Root
        {...props}
        actionsRef={actionsRef}
        onOpenChange={(open, details) => {
          if (!open && details.reason === "outside-press" && !pressed.current) details.cancel()
          else onOpenChange?.(open, details)
        }}
      />
    </DrawerContext.Provider>
  )
}

export function DrawerTrigger(props: ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger data-slot="drawer-trigger" {...props} />
}

interface Drag {
  readonly pointerId: number
  readonly startY: number
  readonly fromScroller: boolean
  lastY: number
  lastT: number
  velocity: number
  offset: number
  dragging: boolean
}

const release = (element: HTMLElement) => {
  element.style.removeProperty("translate")
  element.style.removeProperty("transition")
}

function useDrag(state: DrawerState | null, scroller: RefObject<HTMLElement | null>) {
  const drag = useRef<Drag | null>(null)
  const frame = useRef(0)
  const hold = useRef((event: TouchEvent) => {
    if (drag.current?.dragging) event.preventDefault()
  })

  const end = (element: HTMLElement) => {
    drag.current = null
    element.removeEventListener("touchmove", hold.current)
    if (frame.current !== 0) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }

  const settle = (element: HTMLElement) => {
    if (reducedMotion()) {
      release(element)
      return
    }
    element.style.removeProperty("transition")
    element.style.setProperty("transition-duration", "var(--duration-fast)")
    element.style.setProperty("translate", "0 0")
    const done = (event: TransitionEvent) => {
      if (event.target !== element || event.propertyName !== "translate") return
      element.removeEventListener("transitionend", done)
      if (drag.current?.dragging) return
      element.style.removeProperty("translate")
      element.style.removeProperty("transition-duration")
    }
    element.addEventListener("transitionend", done)
  }

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const element = state?.contentRef.current
      if (!element || event.button !== 0 || (drag.current?.dragging && element.hasPointerCapture(drag.current.pointerId))) return
      const list = scroller.current
      const fromScroller = list !== null && event.target instanceof Node && list.contains(event.target)
      if (fromScroller && list.scrollTop > 0) return
      drag.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastT: event.timeStamp,
        velocity: 0,
        offset: 0,
        fromScroller,
        dragging: false,
      }
      element.addEventListener("touchmove", hold.current, { passive: false })
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current
      const element = state?.contentRef.current
      if (!current || !element || event.pointerId !== current.pointerId) return
      const elapsed = event.timeStamp - current.lastT
      if (elapsed > 0) {
        current.velocity = D.smooth * ((event.clientY - current.lastY) / elapsed) + (1 - D.smooth) * current.velocity
        current.lastY = event.clientY
        current.lastT = event.timeStamp
      }
      const delta = event.clientY - current.startY
      if (!current.dragging) {
        if (Math.abs(delta) < D.slop) return
        if (current.fromScroller && delta < 0) {
          end(element)
          return
        }
        current.dragging = true
        element.setPointerCapture(current.pointerId)
        element.setAttribute("data-dragging", "")
        element.style.setProperty("transition", "none")
      }
      current.offset = delta >= 0 ? delta : delta / D.resist
      if (frame.current !== 0) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const latest = drag.current
        if (latest?.dragging) element.style.setProperty("translate", `0 ${latest.offset}px`, "important")
      })
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current
      const element = state?.contentRef.current
      if (!state || !current || !element || event.pointerId !== current.pointerId) return
      end(element)
      if (!current.dragging) return
      element.removeAttribute("data-dragging")
      const delta = event.clientY - current.startY
      if (!(delta > element.offsetHeight * D.close || (delta > 0 && current.velocity > D.fling))) {
        settle(element)
        return
      }
      if (reducedMotion()) release(element)
      else {
        element.style.removeProperty("transition")
        element.style.setProperty("transition-duration", "var(--duration-fast)")
        element.style.setProperty("translate", "0 100%")
      }
      state.actionsRef.current.close()
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current
      const element = state?.contentRef.current
      if (!current || !element || event.pointerId !== current.pointerId) return
      end(element)
      if (!current.dragging) return
      element.removeAttribute("data-dragging")
      settle(element)
    },
  }
}

export function DrawerContent({
  className,
  children,
  scrollFade = true,
  ornament,
  ...props
}: Omit<ComponentProps<typeof Dialog.Popup>, "className"> & { className?: string; scrollFade?: boolean; ornament?: ReactNode }) {
  const state = useContext(DrawerContext)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useDrag(state, scroller)
  return (
    <Dialog.Portal className="group/drawer-portal">
      <Dialog.Backdrop
        ref={state?.setBackdrop}
        onPointerDown={state?.pressBackdrop}
        data-slot="drawer-overlay"
        forceRender
        className={cn(
          OVERLAY,
          "group-has-[[data-nested]]/drawer-portal:z-(--z-overlay-content)",
          "transition-opacity duration-base ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast",
        )}
      />
      <Dialog.Popup
        ref={state?.setContent}
        data-slot="drawer-content"
        className={cn(
          CONTENT,
          "data-[nested]:z-(--z-overlay-content)",
          "group/drawer outline-none data-[dragging]:cursor-grabbing data-[dragging]:select-none",
          "transition-[translate,opacity] duration-base ease-out-quint data-[starting-style]:translate-y-full data-[starting-style]:opacity-0 data-[ending-style]:translate-y-full data-[ending-style]:opacity-0 data-[ending-style]:duration-fast",
          className,
        )}
        {...props}
        {...drag}
      >
        {ornament}
        <Dialog.Close data-slot="drawer-handle" className={cn(HANDLE, ornament !== undefined && "relative")}>
          <span className={HANDLE_FOCUS}>
            <span className={HANDLE_BAR} />
          </span>
          <span className="sr-only">Close</span>
        </Dialog.Close>
        <div
          ref={scroller}
          className={cn("min-h-0 overflow-x-clip overflow-y-auto overscroll-contain", scrollFade && "md:scroll-fade-y", ornament !== undefined && "relative")}
        >
          {children}
        </div>
        <div aria-hidden className="absolute inset-x-[-0.5px] top-full h-24 border-x-[0.5px] border-border-2 bg-popover" />
      </Dialog.Popup>
    </Dialog.Portal>
  )
}
