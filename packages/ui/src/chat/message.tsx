import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "../button"
import { cn } from "../cn"
import { Check, glyphs } from "../glyph"
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip"
import { Clamp } from "./clamp"

const FOOTER =
  "pointer-events-auto sticky top-0 flex h-7 items-center gap-0.5 rounded-(--radius) border-[0.5px] border-border-2 bg-card px-0.5 opacity-0 shadow-sm transition-opacity group-hover/rail:opacity-100 has-focus-visible:opacity-100 has-[[data-popup-open]]:opacity-100 md:top-(--scroll-fade-ramp,32px)"
const RAIL = "pointer-events-none absolute -top-[22px] right-0 bottom-0 flex flex-col items-end"

export function MessageAction({
  label,
  name = label,
  onClick,
  children,
}: {
  label: string
  name?: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={name} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

const COPIED_MS = 2000

export function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <MessageAction
      label={copied ? "Copied" : "Copy message"}
      name="Copy message"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
      }}
    >
      {copied ? <Check /> : glyphs.copy}
    </MessageAction>
  )
}

export function MessageFooter({ time, touch = false, children }: { time?: ReactNode; touch?: boolean; children?: ReactNode }) {
  return (
    <div data-slot="message-footer" className={cn(FOOTER, touch && "pointer-coarse:opacity-100")}>
      {time === undefined ? null : (
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground-2 tabular-nums select-none px-1.5">{time}</span>
      )}
      {children}
    </div>
  )
}

const BUBBLE = "max-w-full min-w-0 rounded-(--radius-card) bg-secondary px-3 py-2 wrap-anywhere"
const CLAMP_HEIGHT = 288
const CLAMP_CHARS = 420
const CLAMP_LINES = 9

const CLAMP_FADE = { rest: "1.5rem", hover: "2rem" }
const AUTOMATION_CLAMP = { lines: 4 }

export interface MessageClamp {
  readonly text: string
  readonly expanded: boolean
  readonly onToggle: () => void
}

export function MessageBubble({
  clamp,
  height,
  children,
}: {
  clamp?: MessageClamp
  height?: { readonly lines: number }
  children: ReactNode
}) {
  if (clamp === undefined || (height === undefined && clamp.text.length <= CLAMP_CHARS && clamp.text.split("\n").length <= CLAMP_LINES)) {
    return <div className={BUBBLE}>{children}</div>
  }
  return (
    <Clamp
      maxHeight={height ?? CLAMP_HEIGHT}
      fade={height === undefined ? undefined : CLAMP_FADE}
      expanded={clamp.expanded}
      onToggle={clamp.onToggle}
      className={BUBBLE}
    >
      {children}
    </Clamp>
  )
}

export function MessageHeader({ mark, name, detail, time }: { mark: ReactNode; name: ReactNode; detail?: ReactNode; time?: ReactNode }) {
  return (
    <div data-slot="message-header" className="flex max-w-full min-w-0 items-center gap-1.5 text-xs leading-4">
      <span className="flex size-4 shrink-0 items-center justify-center">{mark}</span>
      <span className="min-w-0 text-pretty">
        <span className="font-medium text-foreground">{name}</span>
        {detail === undefined ? null : <span className="pl-1.5 text-muted-foreground-2">{detail}</span>}
      </span>
      {time === undefined ? null : (
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground-2 tabular-nums select-none">{time}</span>
      )}
    </div>
  )
}

export function AutomationMessage({
  title,
  detail,
  time,
  clamp,
  children,
}: {
  title: ReactNode
  detail: ReactNode
  time?: ReactNode
  clamp: MessageClamp
  children: ReactNode
}) {
  return (
    <div data-slot="automation-message" className="flex min-w-0 flex-col gap-1.5 py-2 items-start">
      <MessageHeader mark={glyphs.automation} name={title} detail={detail} time={time} />
      {clamp.text === "" ? null : (
        <div className="flex max-w-[77%] min-w-0 flex-col items-start gap-1.5">
          <MessageBubble clamp={clamp} height={AUTOMATION_CLAMP}>
            {children}
          </MessageBubble>
        </div>
      )}
    </div>
  )
}

export function UserMessage({
  children,
  attachments,
  time,
  actions,
  clamp,
}: {
  children?: ReactNode
  attachments?: ReactNode
  time?: ReactNode
  actions?: ReactNode
  clamp?: MessageClamp
}) {
  const footer =
    time === undefined && actions === undefined ? null : (
      <div className={RAIL}>
        <MessageFooter time={time} touch>
          {actions}
        </MessageFooter>
      </div>
    )
  return (
    <div data-slot="user-message" className="group/message flex min-w-0 flex-col gap-1.5 py-2 items-end">
      <div className={cn("relative flex max-w-[77%] min-w-0 flex-col gap-1.5 group/rail", attachments !== undefined && "w-full", "items-end")}>
        {children === undefined ? null : (
          <div className="relative flex max-w-full min-w-0 flex-col gap-1.5 items-end">
            <MessageBubble clamp={clamp}>{children}</MessageBubble>
            {footer}
          </div>
        )}
        {attachments}
        {children === undefined ? footer : null}
      </div>
    </div>
  )
}

export function MessageSection({ children, time, actions }: { children: ReactNode; time?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-slot="message-section" className="group/rail relative min-w-0">
      {children}
      {time === undefined && actions === undefined ? null : (
        <div className={cn(RAIL, "pointer-coarse:hidden")}>
          <MessageFooter time={time}>{actions}</MessageFooter>
        </div>
      )}
    </div>
  )
}

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <div data-slot="agent-message" className="flex min-w-0 flex-col py-2 gap-[1.5em] max-md:gap-[1.25em]">
      {children}
    </div>
  )
}
