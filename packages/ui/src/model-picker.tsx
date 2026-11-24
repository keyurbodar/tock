import { motion } from "@tock/theme/motion"
import { type ComponentProps, type KeyboardEvent, type PointerEvent, type ReactNode, type UIEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { BrandIcon } from "./brand-icon"
import { cn } from "./cn"
import { Dither } from "./dither"
import { Check } from "./glyph"
import { MenuSeparator } from "./menu"
import { StepSlider } from "./step-slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const P = motion.picker
const SURFACE = "rounded-(--radius-overlay) border-[0.5px] border-border-2 bg-popover text-foreground shadow-overlay"
const ROW =
  "relative flex w-full min-w-0 cursor-pointer items-center gap-2 rounded px-2 text-left text-sm font-normal outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm) h-(--h-menu-row) data-[highlighted]:bg-[var(--menu-row-highlight,var(--popover-hover))] data-[popup-open]:bg-[var(--menu-row-highlight,var(--popover-hover))] text-foreground"
const ROW_ICON = "relative flex size-(--icon-sm) shrink-0 items-center justify-center in-data-[intent=danger]:text-destructive text-foreground opacity-100!"
const LABEL = "mt-1 flex min-h-[22px] items-center text-xs font-medium text-muted-foreground-2 first:mt-0"
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

export interface PickerModel<Step extends string = string> {
  readonly key: string
  readonly name: string
  readonly mark?: string
  readonly price?: string
  readonly stats: ReadonlyArray<readonly [label: string, value: string]>
  readonly steps: readonly Step[]
}

export interface PickerGroup<Step extends string = string> {
  readonly id: string
  readonly name: string
  readonly models: ReadonlyArray<PickerModel<Step>>
}

export interface ModelPickerPanelProps<Step extends string> {
  readonly groups: ReadonlyArray<PickerGroup<Step>>
  readonly selected: string | null
  readonly step: (model: PickerModel<Step>) => Step | undefined
  readonly stepLabel: (step: Step) => string
  readonly onSelect: (model: PickerModel<Step>) => void
  readonly onStep: (model: PickerModel<Step>, step: Step) => void
  readonly initialHighlight?: string | null
  readonly empty?: ReactNode
}

interface Entry<Step extends string> {
  readonly nav: string
  readonly group: PickerGroup<Step>
  readonly model: PickerModel<Step>
}

const navOf = (scope: string, group: string, key: string) => `m:${scope}:${group}/${key}`

const rank = (name: string, query: string) => {
  const text = name.toLowerCase()
  if (text === query) return 0
  if (text.startsWith(query)) return 1
  return text.split(/[\s\-_/.]+/).some((word) => word.startsWith(query)) ? 2 : 3
}

export function PickerRow<Step extends string>({
  nav,
  group,
  model,
  selected,
  highlighted = false,
  ...handlers
}: {
  nav: string
  group: PickerGroup<Step>
  model: PickerModel<Step>
  selected: boolean
  highlighted?: boolean
} & Pick<ComponentProps<"div">, "onPointerMove" | "onPointerLeave" | "onClick">) {
  return (
    <div
      role="option"
      tabIndex={-1}
      data-nav={nav}
      data-highlighted={highlighted ? "" : undefined}
      aria-selected={selected}
      className={ROW}
      onMouseDown={(event) => event.preventDefault()}
      {...handlers}
    >
      <span className={ROW_ICON}>
        <BrandIcon provider={model.mark ?? group.id} name={group.name} className="size-(--icon-base)" />
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate">{model.name}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        {model.price === undefined ? null : (
          <Tooltip>
            <TooltipTrigger render={<span className="text-xs tabular-nums text-muted-foreground-2" />}>{model.price}</TooltipTrigger>
            <TooltipContent side="top">Input and output per 1M tokens</TooltipContent>
          </Tooltip>
        )}
        {selected ? <Check className="size-(--icon-sm) shrink-0 text-foreground" /> : null}
      </span>
    </div>
  )
}

export function PickerSection<Step extends string>({ group, children }: { group: PickerGroup<Step>; children: ReactNode }) {
  return (
    <div data-anchor={group.id}>
      <div className={cn(LABEL, "gap-1.5 sticky top-0 z-(--z-table-lead) -mx-1 mb-(--h-menu-row) bg-popover px-3")}>
        <BrandIcon provider={group.id} name={group.name} className="size-(--icon-xs)" />
        {group.name}
      </div>
      <div className="-mt-(--h-menu-row)">{children}</div>
    </div>
  )
}

export function PickerCardHead<Step extends string>({ group, model }: { group: PickerGroup<Step>; model: PickerModel<Step> }) {
  return (
    <div className="relative -mx-1 -mt-1 overflow-hidden rounded-t-(--radius-overlay) px-1 pt-1">
      <Dither
        from={0}
        to={0.55}
        start={0.5}
        slant={-0.45}
        className="inset-x-0 top-0 w-full [mask-image:linear-gradient(to_bottom,black,transparent)] text-primary opacity-40 h-16"
      />
      <div className="relative flex h-(--h-menu-row) items-center gap-2 px-2 font-medium">
        <span className={ROW_ICON}>
          <BrandIcon provider={model.mark ?? group.id} name={group.name} className="size-(--icon-base)" />
        </span>
        <span className="min-w-0 truncate">{model.name}</span>
      </div>
      <div className="relative flex flex-col gap-1 pt-0.5 pb-1.5">
        {model.stats.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2 px-2 text-xs">
            <span className="text-muted-foreground-2">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PickerCard<Step extends string>({
  group,
  model,
  current,
  stepLabel,
  onStep,
  onCommit,
}: {
  group: PickerGroup<Step>
  model: PickerModel<Step>
  current: Step | undefined
  stepLabel: (step: Step) => string
  onStep: (step: Step) => void
  onCommit?: () => void
}) {
  return (
    <div className="flex flex-col text-sm font-normal">
      <PickerCardHead group={group} model={model} />
      {model.steps.length === 0 ? null : (
        <>
          <MenuSeparator />
          <div className={cn(LABEL, "px-2 justify-between")}>
            Reasoning
            <span className="flex items-baseline gap-2 text-sm font-normal">
              <span className="text-foreground">{current === undefined ? null : stepLabel(current)}</span>
            </span>
          </div>
          <div className="px-2 pt-0.5 pb-1.5">
            <StepSlider
              steps={model.steps}
              value={current}
              label="Reasoning"
              valueText={stepLabel}
              onChange={onStep}
              onCommit={onCommit}
            />
          </div>
        </>
      )}
    </div>
  )
}

export function ModelPickerPanel<Step extends string>({
  groups,
  selected,
  step,
  stepLabel,
  onSelect,
  onStep,
  initialHighlight = null,
  empty = "No models found",
}: ModelPickerPanelProps<Step>) {
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState<string | null>(initialHighlight)
  const [rail, setRail] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [rowTop, setRowTop] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const marks = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const intent = useRef(0)
  const leave = useRef(0)
  const jumping = useRef(false)

  const needle = query.trim().toLowerCase()
  const browsing = needle.length === 0
  const all: Array<Entry<Step>> = groups.flatMap((group) => group.models.map((model) => ({ nav: navOf("lab", group.id, model.key), group, model })))
  const found = all
    .filter(({ model, group }) => `${model.name} ${model.key} ${group.name}`.toLowerCase().includes(needle))
    .map((entry) => ({ ...entry, nav: navOf("search", entry.group.id, entry.model.key) }))
    .sort((a, b) => rank(a.model.name, needle) - rank(b.model.name, needle))
  const entries = browsing ? all : found
  const shown = entries.find((entry) => entry.nav === highlight)

  useEffect(
    () => () => {
      window.clearTimeout(intent.current)
      window.clearTimeout(leave.current)
    },
    [],
  )

  const rows = () => [...(root.current?.querySelectorAll<HTMLElement>("[data-nav]") ?? [])]
  const anchors = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>("[data-anchor]")]

  const measure = (row: HTMLElement) => {
    const box = root.current?.getBoundingClientRect()
    if (box !== undefined) setRowTop(row.getBoundingClientRect().top - box.top)
  }

  const focusRow = (row: HTMLElement | undefined) => {
    if (row === undefined) return
    setHighlight(row.dataset.nav ?? null)
    row.scrollIntoView({ block: "nearest" })
    measure(row)
  }

  const move = (delta: number) => {
    const all = rows()
    const at = all.findIndex((row) => row.dataset.nav === highlight)
    focusRow(all[at === -1 ? (delta > 0 ? 0 : all.length - 1) : (at + delta + all.length) % all.length])
  }

  const jump = (id: string, smooth: boolean) => {
    const element = list.current
    const target = element === null ? undefined : anchors(element).find((anchor) => anchor.dataset.anchor === id)
    if (element === null || target === undefined) return
    jumping.current = true
    setActive(id)
    setHighlight(null)
    element.scrollTo({ top: target.offsetTop, behavior: smooth && !reducedMotion() ? "smooth" : "auto" })
  }

  const scrub = (event: PointerEvent<HTMLDivElement>, smooth: boolean) => {
    const at = [...event.currentTarget.querySelectorAll("button")].findIndex((button) => event.clientY < button.getBoundingClientRect().bottom)
    const id = groups[at === -1 ? groups.length - 1 : at]?.id
    if (id !== undefined && (smooth || id !== active)) jump(id, smooth)
  }

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const heads = anchors(element)
    const top = element.scrollTop
    setRail(heads[0] !== undefined && top > heads[0].offsetTop - P.rail.reveal)
    if (!jumping.current) {
      const end = top + element.clientHeight >= element.scrollHeight - P.rail.end
      const head = end ? heads.at(-1) : (heads.filter((anchor) => anchor.offsetTop <= top + P.rail.active).at(-1) ?? heads[0])
      setActive(head?.dataset.anchor ?? null)
    }
    const row = rows().find((item) => item.dataset.nav === highlight)
    if (row === undefined) return
    const box = row.getBoundingClientRect()
    const view = element.getBoundingClientRect()
    if (box.bottom < view.top + P.card.edge || box.top > view.bottom - P.card.edge) setHighlight(null)
    else measure(row)
  }

  useEffect(() => {
    const element = marks.current
    const mark = element?.querySelector<HTMLElement>(`[data-mark="${CSS.escape(active ?? "")}"]`)
    if (!element || !mark) return
    const above = mark.offsetTop - P.rail.reveal
    const below = mark.offsetTop + mark.offsetHeight + P.rail.reveal - element.clientHeight
    const top = element.scrollTop > above ? above : element.scrollTop < below ? below : undefined
    if (top !== undefined) element.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" })
  }, [active])

  useLayoutEffect(() => {
    const element = card.current
    const frame = root.current
    if (element === null || frame === null) return
    const origin = frame.getBoundingClientRect().top
    const height = element.offsetHeight
    const lowest = frame.offsetHeight + P.card.inset - height
    const wanted = rowTop + P.card.lead <= height - P.card.inset ? -P.card.inset : rowTop + P.card.lead >= lowest ? lowest : rowTop - P.card.inset
    element.style.top = `${Math.max(P.card.edge - origin, Math.min(wanted, window.innerHeight - P.card.edge - origin - height))}px`
    const box = frame.getBoundingClientRect()
    const gap = rail && browsing ? P.card.railGap : P.card.gap
    const overflow = box.right + P.card.gap + element.offsetWidth - (window.innerWidth - P.card.edge)
    const flip = overflow > 0 && box.left - gap - element.offsetWidth >= P.card.edge
    element.style.left = flip ? "auto" : ""
    element.style.right = flip ? "100%" : ""
    element.style.marginRight = flip ? `${gap}px` : ""
    element.style.marginLeft = flip ? "0" : overflow > 0 ? `${P.card.gap - overflow}px` : ""
  })

  const nudge = (delta: number) => {
    if (shown === undefined) return
    const at = shown.model.steps.indexOf(step(shown.model) as Step)
    const next = shown.model.steps[Math.min(shown.model.steps.length - 1, Math.max(0, at + delta))]
    if (next !== undefined && next !== step(shown.model)) onStep(shown.model, next)
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.metaKey || event.ctrlKey || event.nativeEvent.isComposing) return
    const handled = (() => {
      if (event.key === "Tab" && !event.shiftKey) {
        const first = card.current?.querySelector<HTMLElement>('button, [role="slider"]')
        first?.focus()
        return first !== undefined && first !== null
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        move(event.key === "ArrowDown" ? 1 : -1)
        return true
      }
      if (event.key === "Enter") {
        const all = rows()
        const row = all.find((item) => item.dataset.nav === highlight) ?? (browsing ? undefined : all[0])
        row?.click()
        return row !== undefined
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (query !== "" || highlight === null) return false
        nudge(event.key === "ArrowRight" ? 1 : -1)
        return true
      }
      return false
    })()
    if (handled) event.preventDefault()
  }

  const row = ({ nav, group, model }: Entry<Step>) => (
    <PickerRow
      key={nav}
      nav={nav}
      group={group}
      model={model}
      selected={model.key === selected}
      highlighted={highlight === nav}
      onPointerMove={(event) => {
        window.clearTimeout(intent.current)
        if (highlight === nav || event.buttons !== 0 || (event.movementX === 0 && event.movementY === 0)) return
        const element = event.currentTarget
        const run = () => {
          setHighlight(nav)
          measure(element)
        }
        if (highlight !== null && event.movementX > Math.abs(event.movementY) + 1) intent.current = window.setTimeout(run, P.intent)
        else run()
      }}
      onPointerLeave={() => window.clearTimeout(intent.current)}
      onClick={() => onSelect(model)}
    />
  )

  const current = shown === undefined ? undefined : step(shown.model)

  return (
    <div
      ref={root}
      className="relative flex min-h-0 flex-col"
      onPointerEnter={() => window.clearTimeout(leave.current)}
      onPointerLeave={(event) => {
        if (event.buttons !== 0) return
        leave.current = window.setTimeout(() => {
          if (card.current?.contains(document.activeElement) !== true) setHighlight(null)
        }, P.leave)
      }}
    >
      <div data-slot="menu-search-row" className="flex shrink-0 items-center">
        <input
          ref={input}
          autoFocus
          className="h-(--h-menu-row) w-full min-w-0 bg-transparent px-2 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground-3"
          placeholder="Search models"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlight(null)
            setRail(false)
          }}
          onKeyDown={onKey}
        />
      </div>
      <MenuSeparator />
      <div className="relative -mx-1 -mb-1 flex min-h-0">
        <div className="relative flex min-w-0 flex-1 overflow-hidden rounded-b-(--radius-overlay)">
          <div
            ref={list}
            role="listbox"
            aria-label="Models"
            className={cn(
              "relative isolate min-w-0 flex-1 max-h-80 scroll-pt-7 overflow-y-auto px-1 pb-1",
              browsing && rail ? "md:scroll-fade-b" : "md:scroll-fade-y",
              !browsing && "pt-1",
            )}
            onScroll={onScroll}
            onWheel={() => {
              jumping.current = false
              setHighlight(null)
            }}
          >
            {entries.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm font-normal text-muted-foreground-2">{browsing ? empty : "No models found"}</div>
            ) : browsing ? (
              groups.flatMap((group, at) => [
                at === 0 ? null : <MenuSeparator key={`${group.id}:rule`} />,
                <PickerSection key={group.id} group={group}>
                  {group.models.map((model) => row({ nav: navOf("lab", group.id, model.key), group, model }))}
                </PickerSection>,
              ])
            ) : (
              found.map((entry) => row(entry))
            )}
          </div>
        </div>
      </div>
      <div
        data-slot="picker-lab-rail"
        aria-hidden={!(rail && browsing)}
        className={cn(
          SURFACE,
          "absolute -top-[5px] right-full -bottom-[5px] mr-[11px] flex w-[37px] cursor-pointer flex-col overflow-hidden p-0 transition-[opacity,translate] duration-base ease-out motion-reduce:transition-none",
          !(rail && browsing) && "pointer-events-none translate-x-2 opacity-0",
        )}
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          scrub(event, true)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) scrub(event, false)
        }}
      >
        <div ref={marks} className="relative flex min-h-0 flex-1 scrollbar-hide flex-col gap-px overflow-y-auto scroll-fade-y p-1">
          {groups.map((group) => (
            <Tooltip key={group.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={group.name}
                    aria-current={active === group.id}
                    data-mark={group.id}
                    className={cn(
                      "flex h-(--h-menu-row) w-full shrink-0 cursor-pointer items-center justify-center rounded hover:bg-popover-hover hover:text-foreground focus-visible:outline-ring-inset",
                      active === group.id ? "bg-popover-hover text-foreground" : "text-muted-foreground-2",
                    )}
                  />
                }
              >
                <BrandIcon provider={group.id} name={group.name} className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="left">{group.name}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      {shown === undefined ? null : (
        <div
          ref={card}
          data-slot="picker-lab-card"
          className={cn(SURFACE, "p-1 absolute left-full ml-[11px] flex w-72 animate-crossfade-in flex-col motion-reduce:animate-none")}
        >
          <PickerCard
            group={shown.group}
            model={shown.model}
            current={current}
            stepLabel={stepLabel}
            onStep={(next) => onStep(shown.model, next)}
            onCommit={() => input.current?.focus()}
          />
        </div>
      )}
    </div>
  )
}
