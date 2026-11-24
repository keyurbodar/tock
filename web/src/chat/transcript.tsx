import { DotGrid } from "@tock/ui/dot-grid"
import { Markdown } from "@tock/ui/markdown"
import { ActivityLine, ActivityLiveStatus, ActivityStatus, WorkGroup } from "@tock/ui/chat/activity-line"
import { Step as StepView, StepBody, StepCard, StepOutput, StepThought } from "@tock/ui/chat/step"
import {
  AgentMessage,
  Alert,
  ChatStamp,
  ProgressEdge,
  ROW,
  ScrollToEnd,
  UserBubble,
} from "@tock/ui/timeline"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ToolResultMessage } from "../api/types"
import { stamp, titleCase } from "../lib/format"
import type { ThreadState } from "../state/thread"
import { isWorking } from "../state/thread"
import { buildItems, type Item, type Step } from "./items"

const STICK_THRESHOLD = 48
const ARGUMENT_PREVIEW = 80

const resultText = (result: ToolResultMessage | undefined) =>
  result?.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n") ?? ""

function argumentPreview(args: Readonly<Record<string, unknown>>): string {
  const first = Object.values(args).find((value) => typeof value === "string" && value !== "")
  if (typeof first !== "string") return ""
  const flat = first.replace(/\s+/g, " ")
  return flat.length > ARGUMENT_PREVIEW ? `${flat.slice(0, ARGUMENT_PREVIEW - 1)}…` : flat
}

function StepRow({ step }: { step: Step }) {
  if (step.kind === "thinking") {
    return (
      <StepView kind="thought" state={step.active ? "live" : "rest"} label={step.active ? "Thinking" : "Thought"}>
        <StepBody>
          <StepThought>
            <Markdown size="sm" tone="muted" streaming={step.active}>
              {step.text}
            </Markdown>
          </StepThought>
        </StepBody>
      </StepView>
    )
  }
  const output = resultText(step.result)
  const preview = argumentPreview(step.call.arguments)
  const label = preview ? `${titleCase(step.call.name)} ${preview}` : titleCase(step.call.name)
  return (
    <StepView state={step.status === "running" ? "live" : "rest"} label={label} failed={step.status === "failed"}>
      <StepBody>
        <StepCard>
          <StepOutput>{JSON.stringify(step.call.arguments, null, 2)}</StepOutput>
        </StepCard>
        {output ? (
          <StepCard>
            <StepOutput>{output}</StepOutput>
          </StepCard>
        ) : null}
      </StepBody>
    </StepView>
  )
}

function Work({ item }: { item: Extract<Item, { kind: "work" }> }) {
  const [open, setOpen] = useState(false)
  return (
    <ActivityLine
      open={open}
      onOpenChange={setOpen}
      peek={item.active}
      status={item.active ? <ActivityLiveStatus label="Working" /> : <ActivityStatus label="Worked" />}
    >
      <WorkGroup>
        {item.steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </WorkGroup>
    </ActivityLine>
  )
}

function Row({ item }: { item: Item }) {
  if (item.kind === "user") {
    return (
      <UserBubble
        attachments={
          item.images.length > 0
            ? item.images.map((image, index) => (
                <img
                  key={index}
                  alt=""
                  src={`data:${image.mimeType};base64,${image.data}`}
                  className="max-h-40 rounded-(--radius-card) border-[0.5px] border-border-1 object-cover"
                />
              ))
            : undefined
        }
      >
        <Markdown>{item.text}</Markdown>
      </UserBubble>
    )
  }
  if (item.kind === "work") return <Work item={item} />
  if (item.kind === "text") {
    return (
      <AgentMessage>
        <Markdown streaming={item.streaming}>{item.text}</Markdown>
      </AgentMessage>
    )
  }
  return (
    <div className="py-2">
      <Alert title={item.title} tone="destructive">
        {item.detail}
      </Alert>
    </div>
  )
}

export function Transcript({ state }: { state: ThreadState }) {
  const scroller = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  const [away, setAway] = useState(false)
  const items = useMemo(() => buildItems(state.entries, state.live, state.pending), [state.entries, state.live, state.pending])
  const working = isWorking(state)
  const last = items.at(-1)
  const idle = working && (last === undefined || last.kind === "user" || (last.kind === "work" && !last.active))
  const first = items.find((item) => item.kind === "user")

  useLayoutEffect(() => {
    const element = scroller.current
    if (element && stuck.current) element.scrollTop = element.scrollHeight
  })

  const toEnd = () => {
    const element = scroller.current
    if (!element) return
    stuck.current = true
    setAway(false)
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <div className="relative flex h-full min-h-0 flex-col">
          <div
            ref={scroller}
            onScroll={(event) => {
              const element = event.currentTarget
              const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD
              stuck.current = atEnd
              setAway(!atEnd)
            }}
            className="chat-scroller isolate h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [overflow-anchor:none] md:scroll-fade-y"
          >
            <div className="h-3" />
            {first?.kind === "user" && first.at !== null ? (
              <div className={ROW}>
                <ChatStamp>{stamp(first.at)}</ChatStamp>
              </div>
            ) : null}
            {items.map((item) => (
              <div key={item.key} className={ROW} data-chat-row-id={item.key}>
                <Row item={item} />
              </div>
            ))}
            {idle ? (
              <div className={ROW}>
                <div className="flex min-h-7 items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground-1">
                  <DotGrid state="working" className="size-(--icon-sm)" />
                  <span className="text-shimmer">Working</span>
                </div>
              </div>
            ) : null}
            {state.error && !working ? (
              <div className={ROW}>
                <div className="py-2">
                  <Alert title="Something went wrong" tone="destructive">
                    {state.error}
                  </Alert>
                </div>
              </div>
            ) : null}
            <div className="pb-8 max-md:pb-7" />
          </div>
          <ProgressEdge active={working} />
          <ScrollToEnd visible={away} onClick={toEnd} />
        </div>
      </div>
    </div>
  )
}
