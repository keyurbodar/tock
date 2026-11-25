import { motion } from "@tock/theme/motion"
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Toaster as Sonner, type ToasterProps, toast as sonner } from "sonner"
import { Button, type ButtonVariants, buttonVariants } from "./button"
import { ShimmerText } from "./chat/step"
import { cn } from "./cn"
import { DotGrid } from "./dot-grid"
import { CircleAlert, CircleCheck, CircleFail, CircleInfo, Cross } from "./glyph"

const { toast: T } = motion

export type ToastType = "default" | "success" | "error" | "info" | "warning" | "loading"

type ToastId = string | number

type ActionStyle = Pick<ButtonVariants, "variant" | "size">

export type ToastAction =
  | (ActionStyle & { label: ReactNode; onClick: (event: MouseEvent<HTMLButtonElement>) => void })
  | (ActionStyle & { label: ReactNode; href: string })

export interface ToastCancel {
  readonly label: ReactNode
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

export interface ToastOptions {
  readonly id?: ToastId
  readonly description?: ReactNode
  readonly icon?: ReactNode
  readonly duration?: number
  readonly action?: ToastAction
  readonly cancel?: ToastCancel
  readonly onDismiss?: () => void
}

export interface ToastContent extends Omit<ToastOptions, "id"> {
  readonly title: ReactNode
}

export interface ToastCardProps extends Omit<ToastContent, "duration" | "onDismiss"> {
  readonly id: ToastId
  readonly type: ToastType
}

const stampOf = (node: ReactNode) => (node ? (typeof node === "string" ? `text:${node}` : "node") : "empty")

const height = (element: HTMLElement) => Number.parseFloat(getComputedStyle(element).height)

const hold = (event: PointerEvent) => event.stopPropagation()

const EXIT =
  "ease-out-quint starting:translate-y-0 starting:opacity-100 pointer-events-none absolute inset-x-0 top-0 opacity-0 transition-[opacity,translate] duration-[120ms] motion-safe:-translate-y-1"

const ENTER =
  "ease-out-quint starting:translate-y-1 starting:opacity-0 transition-[opacity,translate] duration-fast motion-reduce:starting:translate-y-0"

interface Swapped {
  readonly stamp: string
  readonly body: ReactNode
}

function Swap({ stamp, className, children }: { stamp: string; className?: string; children: ReactNode }) {
  const last = useRef<Swapped | null>(null)
  const [first] = useState(stamp)
  const [changed, setChanged] = useState(false)
  const [leaving, setLeaving] = useState<Swapped | null>(null)

  useLayoutEffect(() => {
    const previous = last.current
    last.current = { stamp, body: children }
    if (previous === null || previous.stamp === stamp) return
    setChanged(true)
    setLeaving(previous.body == null ? null : previous)
  })

  useEffect(() => {
    if (leaving === null) return
    const timer = window.setTimeout(() => setLeaving(null), T.swap)
    return () => window.clearTimeout(timer)
  }, [leaving])

  return (
    <div className={cn("relative", leaving !== null && children != null && "overflow-hidden", className)}>
      {leaving === null ? null : (
        <div
          key={`exit-${leaving.stamp}`}
          aria-hidden
          onTransitionEnd={(event) => {
            if (event.propertyName === "opacity" && event.target === event.currentTarget) setLeaving(null)
          }}
          className={EXIT}
        >
          {leaving.body}
        </div>
      )}
      <div key={stamp} className={cn((changed || stamp !== first) && ENTER)}>
        {children}
      </div>
    </div>
  )
}

const rich = (text: ReactNode) => {
  if (typeof text !== "string" || !text) return text
  const seen = new Map<string, number>()
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part) => {
    const count = (seen.get(part) ?? 0) + 1
    seen.set(part, count)
    const key = `${part}-${count}`
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return (
        <span key={key} className="font-semibold">
          {part.slice(2, -2)}
        </span>
      )
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) return <em key={key}>{part.slice(1, -1)}</em>
    return <span key={key}>{part}</span>
  })
}

const ICON = {
  success: <CircleCheck className="size-(--icon-base) text-success" />,
  error: <CircleFail className="size-(--icon-base) text-destructive" />,
  warning: <CircleAlert className="size-(--icon-base) text-warning-fg" />,
  info: <CircleInfo className="size-(--icon-base) text-info" />,
  loading: <DotGrid className="text-muted-foreground-1" />,
  default: <CircleInfo className="size-(--icon-base) text-muted-foreground-2" />,
} as const satisfies Record<ToastType, ReactNode>

export function ToastCard({ id, type, title, description, icon, action, cancel }: ToastCardProps) {
  const kind = icon == null ? type : "custom"
  const inline = !description && !cancel && action ? action : null
  const head = `${stampOf(title)}|${String(type === "loading")}|${stampOf(inline?.label)}`
  const body = stampOf(description)
  const foot = inline === null ? `${stampOf(action?.label)}|${stampOf(cancel?.label)}` : "inline"
  const stamp = [kind, head, body, foot].join("||")

  const content = useRef<HTMLDivElement>(null)
  const settled = useRef<number | null>(null)
  const frame = useRef(0)
  const shown = useRef<string | null>(null)

  const dismiss = () => {
    sonner.dismiss(id)
  }

  const button = action ? (
    "href" in action ? (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          buttonVariants({ variant: action.variant ?? "solid", size: action.size ?? "xs" }),
          "touch-manipulation",
          inline !== null && "-my-1 shrink-0",
        )}
        onPointerDown={hold}
        onClick={dismiss}
      >
        {action.label}
      </a>
    ) : (
      <Button
        type="button"
        variant={action.variant ?? "solid"}
        size={action.size ?? "xs"}
        className={cn("touch-manipulation", inline !== null && "-my-1 shrink-0")}
        onPointerDown={hold}
        onClick={(event) => {
          action.onClick(event)
          if (!event.defaultPrevented) dismiss()
        }}
      >
        {action.label}
      </Button>
    )
  ) : null

  const resize = (element: HTMLElement, from: number, to: number) => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      element.style.transitionProperty = "none"
      element.style.overflow = "hidden"
      element.style.height = `${from}px`
      void element.offsetHeight
      element.style.transitionProperty = ""
      element.style.height = `${to}px`
    })
  }

  useLayoutEffect(() => {
    const element = content.current
    const previous = shown.current
    shown.current = stamp
    if (!element) return
    const sized = element.style.height !== ""
    if (previous === null || previous === stamp) {
      if (!sized) {
        settled.current = height(element)
        return
      }
      const from = height(element)
      element.style.height = ""
      const to = height(element)
      settled.current = to
      if (Math.abs(from - to) < 1) {
        cancelAnimationFrame(frame.current)
        element.style.overflow = ""
        return
      }
      resize(element, from, to)
      return
    }
    const from = sized ? height(element) : settled.current
    element.style.height = ""
    const to = height(element)
    settled.current = to
    if (from === null || Math.abs(from - to) < 1) return
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) resize(element, from, to)
  })

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const release = (event: TransitionEvent<HTMLDivElement>) => {
    const element = content.current
    if (event.target !== element || event.propertyName !== "height" || !element) return
    element.style.height = ""
    element.style.overflow = ""
  }

  return (
    <div className="relative z-(--z-toast) mx-px flex h-full items-start gap-2 overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-2 bg-popover p-4 font-sans text-sm shadow-overlay">
      <div
        ref={content}
        data-sonner-content=""
        onTransitionEnd={release}
        className="ease-out-quint relative min-w-0 flex-1 transition-[height] duration-base motion-reduce:transition-none"
      >
        <div className="flex w-full min-w-0 items-start gap-2 pr-8">
          <Swap stamp={kind}>
            <div className="flex h-4 items-center [&_svg:not([class*='size-'])]:size-(--icon-base)">{icon ?? ICON[type]}</div>
          </Swap>
          <div className="min-w-0 flex-1">
            <Swap stamp={head}>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-3.5">
                <p className="min-w-0 flex-auto text-sm font-medium text-foreground">
                  {type === "loading" ? <ShimmerText state="live">{title}</ShimmerText> : title}
                </p>
                {inline === null ? null : button}
              </div>
            </Swap>
            <Swap stamp={body} className={description ? "mt-0.5" : undefined}>
              {description ? <div className="text-sm font-normal text-muted-foreground-2">{rich(description)}</div> : null}
            </Swap>
            <Swap stamp={foot} className={inline === null && (cancel || action) ? "mt-2.5" : undefined}>
              {inline === null && (cancel || action) ? (
                <div className="flex items-center gap-2">
                  {button}
                  {cancel ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="touch-manipulation"
                      onPointerDown={hold}
                      onClick={(event) => {
                        cancel.onClick?.(event)
                        if (!event.defaultPrevented) dismiss()
                      }}
                    >
                      {cancel.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Swap>
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onPointerDown={hold}
        onClick={dismiss}
        className="absolute right-4 top-3.5 inline-flex size-5 flex-none touch-manipulation items-center justify-center rounded-(--radius-sm) text-muted-foreground-3 outline-none transition-colors duration-100 hover:bg-secondary hover:text-foreground focus-visible:outline-ring-inset"
      >
        <Cross className="size-(--icon-sm)" />
      </button>
    </div>
  )
}

const isContent = (value: unknown): value is ToastContent =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !isValidElement(value) && "title" in value

const contentOf = (title: ReactNode | ToastContent, options?: ToastOptions): ToastContent =>
  isContent(title)
    ? {
        ...title,
        icon: options?.icon ?? title.icon,
        duration: options?.duration ?? title.duration,
        onDismiss: () => {
          title.onDismiss?.()
          options?.onDismiss?.()
        },
      }
    : {
        title,
        description: options?.description,
        icon: options?.icon,
        duration: options?.duration,
        action: options?.action,
        cancel: options?.cancel,
        onDismiss: options?.onDismiss,
      }

const show = (type: ToastType, title: ReactNode | ToastContent, options?: ToastOptions) => {
  const { duration, onDismiss, ...content } = contentOf(title, options)
  return sonner.custom((id) => <ToastCard id={id} type={type} {...content} />, {
    ...(options?.id === undefined ? {} : { id: options.id }),
    duration: type === "loading" ? (duration ?? Number.POSITIVE_INFINITY) : duration,
    onDismiss: () => {
      onDismiss?.()
    },
  })
}

type Show = (title: ReactNode | ToastContent, options?: ToastOptions) => ToastId

export const toast = Object.assign(((title, options) => show("default", title, options)) as Show, {
  success: ((title, options) => show("success", title, options)) as Show,
  error: ((title, options) => show("error", title, options)) as Show,
  info: ((title, options) => show("info", title, options)) as Show,
  warning: ((title, options) => show("warning", title, options)) as Show,
  loading: ((title, options) => show("loading", title, options)) as Show,
  dismiss: (id?: ToastId) => sonner.dismiss(id),
  custom: (render: Parameters<typeof sonner.custom>[0], options?: Pick<ToastOptions, "id" | "duration" | "onDismiss">) =>
    sonner.custom(render, {
      ...(options?.id === undefined ? {} : { id: options.id }),
      ...(options?.duration === undefined ? {} : { duration: options.duration }),
      ...(options?.onDismiss ? { onDismiss: options.onDismiss } : {}),
    }),
  promise: sonner.promise,
  message: sonner.message,
})

const MOBILE_OFFSET = { top: "calc(1rem + var(--safe-top))", bottom: "calc(1rem + var(--safe-bottom))" } as const

export function Toaster({ className, style, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className={cn("toaster group", className)}
      style={{ "--width": `${T.width}px`, ...style } as CSSProperties}
      mobileOffset={MOBILE_OFFSET}
      {...props}
    />
  )
}
