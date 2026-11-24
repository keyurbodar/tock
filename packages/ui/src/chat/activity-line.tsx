import { motion } from "@tock/theme/motion"
import { Children, type CSSProperties, type ReactNode, createContext, useContext, useState } from "react"
import { cn } from "../cn"
import { CLIP, Collapse } from "./collapse"
import { CHEVRON, Duration, ENTER, HEADER_BUTTON, ShimmerText } from "./step"
import { Tail } from "./tail"

const RULE =
  "w-[clamp(0px,calc((100%-24px)*9999),100%)] border-t-[0.5px] border-border-2 motion-safe:transition-[scale] motion-safe:duration-base motion-safe:ease-out-quint"
const RULE_CLOSED = "scale-x-0 motion-safe:duration-[120ms]"
const BUTTON =
  "flex min-h-7 min-w-0 items-center gap-1.5 py-1 transition-colors duration-100 hover:text-foreground [&>svg:last-child]:opacity-0 [&>svg:last-child]:transition-opacity [&>svg:last-child]:duration-fast [&>svg:last-child]:ease-out-quint [&:hover>svg:last-child]:opacity-100 data-[panel-open]:[&>svg:last-child]:opacity-100 w-fit max-w-[86%] cursor-pointer text-xs select-none md:max-w-[80%] font-normal text-muted-foreground-2"
const MEMBER_ARRIVING =
  "motion-safe:duration-fast motion-safe:ease-out-quint motion-safe:starting:-translate-y-2 motion-safe:starting:opacity-0 motion-safe:transition-[padding,translate,opacity]"
const MEMBER_STEADY = "motion-safe:transition-[padding] motion-safe:duration-fast motion-safe:ease-out-quint"
const LIST =
  "flex flex-col gap-1 motion-safe:transition-[padding] motion-safe:duration-fast motion-safe:ease-out-quint pt-1 pb-1"

const HEADER_CLOSED =
  "grid motion-safe:transition-[grid-template-rows,opacity] grid-rows-[0fr] opacity-0 duration-[120ms] ease-out-quint"

const ExpandedContext = createContext(true)

export function ActivityStatus({ label, duration }: { label: ReactNode; duration?: string }) {
  return (
    <span className="flex min-w-0 items-baseline tabular-nums">
      <span className="truncate min-w-0">
        <span>{label}</span>
      </span>
      {duration !== undefined && (
        <span className="shrink-0 whitespace-pre">
          <span>
            {" for "}
            <Duration value={duration} />
          </span>
        </span>
      )}
    </span>
  )
}

export function ActivityLiveStatus({ label, duration, rolling }: { label: ReactNode; duration?: string; rolling?: boolean }) {
  return (
    <span data-slot="live-status" className="flex min-w-0 items-center tabular-nums">
      <span className="flex min-w-0 items-center">
        <span className="peer flex min-w-0 items-center gap-1.5 empty:hidden" />
        <span className="shrink-0 whitespace-pre peer-[:not(:empty)]:before:content-['_']">
          <span>
            <ShimmerText state="live">{label}</ShimmerText>
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 empty:hidden">
        {duration !== undefined && (
          <span className="shrink-0 whitespace-pre">
            <span className={ENTER}>
              {" for "}
              <Duration value={duration} rolling={rolling} />
            </span>
          </span>
        )}
      </span>
    </span>
  )
}

export interface ActivityLineProps {
  readonly status: ReactNode
  readonly open?: boolean
  readonly defaultOpen?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly peek?: boolean
  readonly children?: ReactNode
}

export function ActivityLine({ status, open, defaultOpen = false, onOpenChange, peek = false, children }: ActivityLineProps) {
  const [local, setLocal] = useState(defaultOpen)
  const expanded = open ?? local
  const visible = expanded || peek
  const [mounted, setMounted] = useState(visible)
  const [arriving, setArriving] = useState(expanded)
  if (visible && !mounted) setMounted(true)
  const toggle = () => {
    setArriving(!expanded)
    setLocal(!expanded)
    onOpenChange?.(!expanded)
  }
  return (
    <div data-slot="activity-line" className="flex flex-col items-center">
      <div className="flex w-full items-center justify-center gap-3">
        <span aria-hidden="true" className="flex min-w-0 flex-1 justify-end">
          <span className={cn(RULE, !expanded && RULE_CLOSED, "origin-right")} />
        </span>
        <button type="button" aria-expanded={expanded} className={BUTTON} onClick={toggle}>
          {status}
        </button>
        <span aria-hidden="true" className="flex min-w-0 flex-1">
          <span className={cn(RULE, !expanded && RULE_CLOSED, "origin-left")} />
        </span>
      </div>
      <div className="flex w-full flex-col text-left">
        <ExpandedContext.Provider value={expanded}>
          {Children.toArray(children).map((member, index) => (
            <Collapse key={index} open={visible} slot="activity-line-member" onClosed={() => setMounted(false)}>
              {mounted && (
                <div
                  className={arriving ? MEMBER_ARRIVING : MEMBER_STEADY}
                  style={arriving ? ({ transitionDelay: `${index * motion.stagger}ms` } as CSSProperties) : undefined}
                >
                  {member}
                </div>
              )}
            </Collapse>
          ))}
        </ExpandedContext.Provider>
      </div>
    </div>
  )
}

export function WorkGroup({ children }: { children: ReactNode }) {
  const lineExpanded = useContext(ExpandedContext)
  const [inspected, setInspected] = useState(false)
  const expanded = lineExpanded || inspected
  return (
    <div className="flex min-w-0 flex-col">
      <div inert aria-hidden="true" className={HEADER_CLOSED}>
        <div className={CLIP}>
          <div role="button" tabIndex={0} aria-expanded="true" data-panel-open="true" className={HEADER_BUTTON}>
            <span className="flex min-w-0 items-baseline tabular-nums">
              <span className="min-w-0 truncate" />
              <span className="shrink-0 whitespace-pre" />
            </span>
            {CHEVRON}
          </div>
        </div>
      </div>
      <Collapse open slot="work-group-panel">
        <Tail clamped={!expanded} onInspect={() => setInspected(true)}>
          <div className={LIST}>
            {Children.toArray(children).map((row, index) => (
              <div key={index} className="min-w-0">
                {row}
              </div>
            ))}
          </div>
        </Tail>
      </Collapse>
    </div>
  )
}
