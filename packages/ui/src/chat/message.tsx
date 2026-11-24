import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "../button"
import { cn } from "../cn"
import { Check, glyphs } from "../glyph"
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip"

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

export function UserMessage({ children, attachments, time, actions }: { children: ReactNode; attachments?: ReactNode; time?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-slot="user-message" className="group/message flex min-w-0 flex-col gap-1.5 py-2 items-end">
      <div className="relative flex max-w-[77%] min-w-0 flex-col gap-1.5 group/rail items-end">
        {attachments}
        <div className="relative flex max-w-full min-w-0 flex-col gap-1.5 items-end">
          <div className="max-w-full min-w-0 rounded-(--radius-card) bg-secondary px-3 py-2 wrap-anywhere">{children}</div>
          {time === undefined && actions === undefined ? null : (
            <div className={RAIL}>
              <MessageFooter time={time} touch>
                {actions}
              </MessageFooter>
            </div>
          )}
        </div>
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
