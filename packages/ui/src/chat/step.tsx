import { Collapsible } from "@base-ui/react/collapsible"
import { type CSSProperties, type ReactNode, useContext, useLayoutEffect, useRef, useState } from "react"
import { cn } from "../cn"
import { InspectContext } from "./tail"

const HEADER_BASE = "min-h-7 min-w-0 py-1 text-sm text-muted-foreground-1"
export const HEADER_BUTTON = cn(
  HEADER_BASE,
  "group/collapsible flex cursor-pointer items-center gap-1.5 rounded text-left font-medium outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm) focus-visible:outline-ring-inset focus-gutter w-fit transition-colors duration-100 hover:text-foreground [&>svg:last-child]:opacity-0 [&>svg:last-child]:transition-opacity [&>svg:last-child]:duration-fast [&>svg:last-child]:ease-out-quint [&:hover>svg:last-child]:opacity-100 data-[panel-open]:[&>svg:last-child]:opacity-100 max-w-full [--focus-ring:var(--muted-foreground-2)]",
)
const HEADER_STATIC = "flex min-h-7 min-w-0 items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground-1"
const PANEL =
  "h-(--collapsible-panel-height) transition-[height,opacity] duration-[150ms,150ms] ease-out-quint motion-reduce:transition-none data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms,120ms] overflow-clip [overflow-clip-margin:8px]"
export const ENTER = "motion-safe:transition-opacity motion-safe:duration-fast motion-safe:ease-out-quint motion-safe:starting:opacity-0"
const ROLL_ENTER = "transition-opacity duration-fast ease-out-quint starting:opacity-0"
const ROLL_OFFSETS = Array.from({ length: 21 }, (_, index) => index - 10)

export type ShimmerState = "live" | "settling" | "rest"

export function ShimmerText({ state, children, className }: { state: ShimmerState; children: ReactNode; className?: string }) {
  return (
    <span data-slot="shimmer-text" data-state={state} className={cn("text-shimmer", className)}>
      {children}
    </span>
  )
}

const ROLL_MASK =
  "absolute inset-0 overflow-clip [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)]"

const milliseconds = (value: string) => (value.trim().endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000)

const wrap = (value: number) => ((value % 10) + 10) % 10

function Digit({ digit, trend, rolled }: { digit: number; trend: number; rolled: boolean }) {
  const [shown, setShown] = useState(digit)
  const [rolling, setRolling] = useState(rolled)
  const target = useRef(digit)
  const position = useRef(digit)
  const strip = useRef<HTMLSpanElement>(null)
  const animation = useRef<Animation | null>(null)
  const pending = useRef<{ from: number; to: number } | null>(null)

  useLayoutEffect(() => {
    if (digit === target.current) return
    const forward = (digit - target.current + 10) % 10
    target.current = digit
    const step = trend > 0 ? forward : trend < 0 ? forward - 10 : forward <= 5 ? forward : forward - 10
    const raw = position.current + step
    const to = wrap(raw)
    let from = position.current
    const node = strip.current
    if (node !== null) {
      const style = getComputedStyle(node)
      const line = parseFloat(style.lineHeight)
      if (Number.isFinite(line) && line > 0 && style.transform !== "none") {
        from = position.current - new DOMMatrixReadOnly(style.transform).m42 / line
      }
    }
    const shifted = from + (to - raw)
    position.current = to
    pending.current = { from: shifted - Math.trunc((shifted - to) / 10) * 10, to }
    setRolling(true)
    setShown(to)
  }, [digit, trend])

  useLayoutEffect(() => {
    const move = pending.current
    const node = strip.current
    if (move === null || node === null || shown !== move.to) return
    pending.current = null
    animation.current?.cancel()
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const style = getComputedStyle(node)
    animation.current = node.animate(
      [{ transform: `translateY(calc(${move.to - move.from} * 1lh))` }, { transform: "translateY(0px)" }],
      {
        duration: milliseconds(style.getPropertyValue("--duration-slower")),
        easing: style.getPropertyValue("--ease-out-quint").trim(),
      },
    )
  }, [shown, rolling])

  return (
    <span className="relative inline-block">
      <span
        aria-hidden="true"
        data-d={rolling ? 0 : digit}
        className={cn("before:content-[attr(data-d)]", rolling && "invisible")}
      />
      {rolling && (
        <span aria-hidden="true" className={ROLL_MASK}>
          <span ref={strip} className="absolute inset-x-0 top-0">
            {ROLL_OFFSETS.map((offset) => (
              <span
                key={offset}
                data-d={wrap(shown + offset)}
                className="absolute inset-x-0 before:content-[attr(data-d)]"
                style={{ top: `calc(${offset}lh)` }}
              />
            ))}
          </span>
        </span>
      )}
    </span>
  )
}

const seconds = (value: string) => {
  const parts = /^(?:(\d+)h )?(?:(\d+)m )?(\d+)s$/.exec(value)
  return parts === null ? undefined : Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3])
}

export function Duration({ value, rolling = false }: { value: string; rolling?: boolean }) {
  const amount = seconds(value)
  const previous = useRef(amount)
  const mounted = useRef(rolling)
  const trend = amount === undefined || previous.current === undefined ? 0 : Math.sign(amount - previous.current)
  useLayoutEffect(() => {
    mounted.current = true
    previous.current = amount
  })
  if (value.includes(".")) return <>{value}</>
  const enter = mounted.current ? ROLL_ENTER : undefined
  const chars = [...value]
  return (
    <span className="inline-flex items-baseline leading-[inherit] tabular-nums">
      <span className="sr-only">{value}</span>
      {chars.map((char, index) => {
        const key = `rpos-${chars.length - 1 - index}`
        return char >= "0" && char <= "9" ? (
          <span key={key} aria-hidden="true" className={cn("inline-block", enter)}>
            <Digit digit={Number(char)} trend={trend} rolled={rolling} />
          </span>
        ) : (
          <span
            key={key}
            aria-hidden="true"
            data-c={char === " " ? "\u00a0" : char}
            className={cn("inline-block whitespace-pre before:content-[attr(data-c)]", enter)}
          />
        )
      })}
    </span>
  )
}

export const CHEVRON = (
  <svg
    aria-hidden="true"
    className="-rotate-90 text-muted-foreground-3 group-data-[panel-open]/collapsible:rotate-0"
    fill="none"
    height="24px"
    viewBox="0 0 24 24"
    width="24px"
  >
    <path
      d="M8 10L10.9393 12.9393C11.5251 13.5251 12.4749 13.5251 13.0607 12.9393L16 10"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
)

const FAILED = (
  <span role="img" aria-label="Failed" className="flex shrink-0 text-destructive">
    <svg aria-hidden="true" className="size-(--icon-sm)" fill="none" height="24px" viewBox="0 0 24 24" width="24px">
      <path
        clipRule="evenodd"
        d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM9.70711 8.29289C9.31658 7.90237 8.68342 7.90237 8.29289 8.29289C7.90237 8.68342 7.90237 9.31658 8.29289 9.70711L10.5858 12L8.29289 14.2929C7.90237 14.6834 7.90237 15.3166 8.29289 15.7071C8.68342 16.0976 9.31658 16.0976 9.70711 15.7071L12 13.4142L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L13.4142 12L15.7071 9.70711C16.0976 9.31658 16.0976 8.68342 15.7071 8.29289C15.3166 7.90237 14.6834 7.90237 14.2929 8.29289L12 10.5858L9.70711 8.29289Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  </span>
)

export type StepKind = "plain" | "tool" | "summary" | "thought"

export interface StepProps {
  readonly kind?: StepKind
  readonly label: ReactNode
  readonly state?: ShimmerState
  readonly duration?: string
  readonly rolling?: boolean
  readonly entering?: boolean
  readonly failed?: boolean
  readonly outcome?: string
  readonly open?: boolean
  readonly defaultOpen?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly children?: ReactNode
}

function Label({ kind, label, state }: Pick<StepProps, "kind" | "label" | "state">) {
  const text = state ? (
    <ShimmerText state={state} className="truncate">
      {label}
    </ShimmerText>
  ) : (
    <span className="truncate">{label}</span>
  )
  if (kind === "plain") return <span className="min-w-0 truncate">{label}</span>
  if (kind === "summary") {
    return <span className="inline-grid [&>*]:col-start-1 [&>*]:row-start-1 min-w-0 truncate tabular-nums">{text}</span>
  }
  return (
    <span className="min-w-0 truncate">
      <span className="inline-grid min-w-0 align-baseline">{text}</span>
    </span>
  )
}

function Title({ kind = "tool", label, state, duration, rolling, entering, failed, outcome }: StepProps) {
  if (kind === "thought") {
    return (
      <span className="flex min-w-0 items-baseline tabular-nums">
        <Label kind="tool" label={label} state={state} />
        {duration ? (
          <span className={cn("shrink-0 whitespace-pre", rolling && ENTER)}>
            {" for "}
            <Duration value={duration} rolling={rolling} />
          </span>
        ) : null}
      </span>
    )
  }
  return (
    <>
      <Label kind={kind} label={label} state={state} />
      {duration ? (
        <span className={cn("shrink-0 text-muted-foreground-2 tabular-nums", (entering ?? kind === "summary") && ENTER)}>
          <Duration value={duration} rolling={rolling} />
        </span>
      ) : null}
      {outcome ? <span className="shrink-0 text-muted-foreground-2 tabular-nums">{outcome}</span> : null}
      {failed ? FAILED : null}
    </>
  )
}

const AUTO = { "--collapsible-panel-height": "auto", "--collapsible-panel-width": "auto" } as CSSProperties

export function Step(props: StepProps) {
  const { open, defaultOpen, onOpenChange, children } = props
  const inspect = useContext(InspectContext)
  if (children === undefined) {
    return (
      <div data-slot="collapsible" data-closed="">
        <div className={HEADER_STATIC}>
          <Title {...props} />
        </div>
      </div>
    )
  }
  return (
    <Collapsible.Root
      data-slot="collapsible"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => {
        if (next) inspect()
        onOpenChange?.(next)
      }}
    >
      <Collapsible.Trigger
        nativeButton={false}
        render={(trigger, state) => <div {...trigger} data-panel-open={state.open ? "true" : undefined} />}
        className={HEADER_BUTTON}
      >
        <Title {...props} />
        {CHEVRON}
      </Collapsible.Trigger>
      <Collapsible.Panel data-slot="collapsible-panel" className={PANEL} style={AUTO}>
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export function StepBody({ children }: { children: ReactNode }) {
  return <div className="pt-1 pb-2">{children}</div>
}

export function StepThought({ children }: { children: ReactNode }) {
  return (
    <div className="relative pl-6">
      <div className="absolute inset-y-0.5 left-[11px] w-0.5 rounded-full bg-border-3" />
      {children}
    </div>
  )
}

const CARD = "flex flex-col overflow-clip rounded-(--radius-card) border-[0.5px] border-border-1 bg-card"
const CARD_SCROLL =
  "max-h-72 flex flex-col gap-1.5 overflow-x-hidden overflow-y-auto px-2.5 py-1.5 font-mono text-code-block leading-normal md:scroll-fade-y"

export function StepCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={CARD}>
      <div className={CARD_SCROLL}>{children}</div>
      {footer}
    </div>
  )
}

export function StepCommand({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <span aria-hidden="true" className="shrink-0 text-muted-foreground-3">
        $
      </span>
      <span data-component="shell-command" className="min-w-0 break-words whitespace-pre-wrap text-foreground">
        {children}
      </span>
    </div>
  )
}

export function StepOutput({ children }: { children: ReactNode }) {
  return (
    <pre className="min-w-0 break-words whitespace-pre-wrap text-muted-foreground-1">
      <span className="ansi-text">{children}</span>
    </pre>
  )
}

export function StepCardFooter({ status, duration }: { status: ReactNode; duration?: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-1.5 px-2.5 pt-0.5 pb-1.5 text-2xs tabular-nums">
      <span className="text-muted-foreground-3">{status}</span>
      {duration ? (
        <span className="flex gap-1.5">
          <span className={cn("shrink-0 text-muted-foreground-2 tabular-nums", ENTER)}>{duration}</span>
        </span>
      ) : null}
    </div>
  )
}

export function StepList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 pt-1 pb-1 pl-2.5">{children}</div>
}

export function StepListItem({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-rows-[1fr]">
      <div className="min-h-0 min-w-0 overflow-clip focus-gutter [overflow-clip-margin:2px]">{children}</div>
    </div>
  )
}
