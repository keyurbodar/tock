import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { Link } from "@tanstack/react-router"
import { Button } from "@tock/ui/button"
import { Icon } from "@tock/ui/icon"
import { MENU_LABEL, MENU_ROW } from "@tock/ui/menu"
import { Popover, PopoverContent, PopoverTrigger } from "@tock/ui/popover"
import { useMemo, useRef, useState } from "react"
import type { ModelInfo, ThinkingLevel } from "../api/types"
import { titleCase } from "../lib/format"
import { modelSpec, useModels, useProviders } from "../state/data"

export interface ModelChoice {
  readonly model: string | null
  readonly thinkingLevel: ThinkingLevel | null
}

export function findModel(models: readonly ModelInfo[], spec: string | null): ModelInfo | undefined {
  return spec === null ? undefined : models.find((model) => modelSpec(model) === spec)
}

const matches = (model: ModelInfo, query: string) =>
  query === "" || `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(query)

export function ModelPicker({
  value,
  onChange,
  emptyLabel = "Select model",
  side = "top",
  showLevel = true,
}: {
  value: ModelChoice
  onChange: (value: ModelChoice) => void
  emptyLabel?: string
  side?: "top" | "bottom"
  showLevel?: boolean
}) {
  const models = useModels()
  const providers = useProviders()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const selected = findModel(models, value.model)
  const visible = useMemo(() => models.filter((model) => matches(model, query.trim().toLowerCase())), [models, query])
  const names = useMemo(() => new Map(providers.map((provider) => [provider.id, provider.name])), [providers])
  const level = selected && value.thinkingLevel && selected.thinkingLevels.includes(value.thinkingLevel) ? value.thinkingLevel : null

  const choose = (model: ModelInfo) => {
    const keep = value.thinkingLevel !== null && model.thinkingLevels.includes(value.thinkingLevel)
    onChange({ model: modelSpec(model), thinkingLevel: keep ? value.thinkingLevel : null })
    setOpen(false)
  }

  const move = (delta: number) => {
    const next = Math.min(visible.length - 1, Math.max(0, cursor + delta))
    setCursor(next)
    list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setQuery("")
        setCursor(0)
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" aria-label="Model" className="min-w-0" />}>
        <span className="min-w-0 truncate">{selected?.name ?? emptyLabel}</span>
        {showLevel && level ? <span className="text-muted-foreground-2">{titleCase(level)}</span> : null}
        <span className="flex shrink-0 text-muted-foreground-3 [&_svg]:size-(--icon-sm)">
          <Icon icon={ArrowDown01Icon} />
        </span>
      </PopoverTrigger>
      <PopoverContent side={side} align="start">
        <div className="relative flex min-h-0 flex-col">
          <div data-slot="menu-search-row" className="flex shrink-0 items-center">
            <input
              autoFocus
              value={query}
              placeholder="Search models"
              aria-label="Search models"
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setCursor(0)
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  move(1)
                } else if (event.key === "ArrowUp") {
                  event.preventDefault()
                  move(-1)
                } else if (event.key === "Enter") {
                  event.preventDefault()
                  const model = visible[cursor]
                  if (model) choose(model)
                }
              }}
              className="h-(--h-menu-row) w-full min-w-0 bg-transparent px-2 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground-3"
            />
          </div>
          <div data-slot="menu-separator" className="-mx-1 my-1 h-px shrink-0 bg-border-1" />
          <div className="relative -mx-1 -mb-1 flex min-h-0">
            <div className="relative flex min-w-0 flex-1 overflow-hidden rounded-b-(--radius-overlay)">
              <div
                ref={list}
                role="listbox"
                aria-label="Models"
                className="relative isolate max-h-80 min-w-0 flex-1 scroll-pt-7 overflow-y-auto px-1 pb-1 md:scroll-fade-y"
              >
                {visible.length === 0 ? (
                  <div className="flex flex-col gap-1 px-2 py-3 text-sm text-muted-foreground-2">
                    <span>{models.length === 0 ? "No provider is connected yet." : "No models match."}</span>
                    {models.length === 0 ? (
                      <Link
                        to="/settings/$section"
                        params={{ section: "models" }}
                        className="text-(--text-link) underline-offset-2 hover:underline"
                      >
                        Add a provider key
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {visible.map((model, index) => {
                  const spec = modelSpec(model)
                  const heading = index === 0 || visible[index - 1]?.provider !== model.provider
                  return (
                    <div key={spec}>
                      {heading ? <div className={MENU_LABEL}>{names.get(model.provider) ?? model.provider}</div> : null}
                      <div
                        role="option"
                        tabIndex={-1}
                        data-index={index}
                        aria-selected={spec === value.model}
                        data-highlighted={index === cursor ? "" : undefined}
                        onPointerMove={() => setCursor(index)}
                        onClick={() => choose(model)}
                        className={MENU_ROW}
                      >
                        <span className="min-w-0 truncate">{model.name}</span>
                        {spec === value.model ? (
                          <span className="ml-auto flex shrink-0 items-center pl-2">
                            <Icon icon={Tick02Icon} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {showLevel && selected && selected.thinkingLevels.length > 1 ? (
            <>
              <div data-slot="menu-separator" className="-mx-1 mt-1 h-px shrink-0 bg-border-1" />
              <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                <span className="text-xs font-medium text-muted-foreground-2">Thinking</span>
                <div role="radiogroup" aria-label="Thinking level" className="ml-auto flex min-w-0 flex-wrap justify-end gap-0.5">
                  {selected.thinkingLevels.map((option) => (
                    <Button variant="ghost"
                      key={option}
                      role="radio"
                      size="xs"
                      aria-checked={option === level}
                      selected={option === level}
                      onClick={() => onChange({ model: value.model, thinkingLevel: option })}
                    >
                      {titleCase(option)}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
