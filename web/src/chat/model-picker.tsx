import { Link } from "@tanstack/react-router"
import { BrandIcon, familyOf } from "@tock/ui/brand-icon"
import { Button } from "@tock/ui/button"
import { ChevronDown } from "@tock/ui/glyph"
import { ModelPickerPanel, type PickerGroup, type PickerModel } from "@tock/ui/model-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@tock/ui/popover"
import { useMemo, useState } from "react"
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

const price = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 6 })
const context = (tokens: number) => (tokens >= 1e6 ? `${Number((tokens / 1e6).toFixed(1))}M` : `${Math.round(tokens / 1e3)}K`)

const entry = (model: ModelInfo, levels: boolean): PickerModel<ThinkingLevel> => ({
  key: modelSpec(model),
  name: model.name,
  mark: familyOf(model.name),
  price: model.cost.input === 0 && model.cost.output === 0 ? "Free" : `${price(model.cost.input)} / ${price(model.cost.output)}`,
  stats: [
    ["Context", context(model.contextWindow)],
    ["Input per 1M", price(model.cost.input)],
    ["Output per 1M", price(model.cost.output)],
  ],
  steps: levels && model.thinkingLevels.length > 1 ? model.thinkingLevels : [],
})

export const levelFor = (levels: readonly ThinkingLevel[], wanted: ThinkingLevel | null | undefined): ThinkingLevel | null => {
  if (wanted === null || wanted === undefined) return null
  return levels.includes(wanted) ? wanted : (levels[0] ?? null)
}

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
  const [drafts, setDrafts] = useState<Readonly<Record<string, ThinkingLevel>>>({})
  const selected = findModel(models, value.model)
  const level = selected && value.thinkingLevel && selected.thinkingLevels.includes(value.thinkingLevel) ? value.thinkingLevel : null
  const shownLevel = level ?? (selected && selected.thinkingLevels.length > 1 ? selected.thinkingLevels[0] : undefined)

  const groups = useMemo(() => {
    const names = new Map(providers.map((provider) => [provider.id, provider.name]))
    const byProvider = new Map<string, Array<PickerModel<ThinkingLevel>>>()
    for (const model of models) {
      const list = byProvider.get(model.provider) ?? []
      list.push(entry(model, showLevel))
      byProvider.set(model.provider, list)
    }
    return [...byProvider].map(([id, list]): PickerGroup<ThinkingLevel> => ({ id, name: names.get(id) ?? id, models: list }))
  }, [models, providers, showLevel])

  const chosen = (model: PickerModel<ThinkingLevel>) =>
    levelFor(model.steps, model.key === value.model ? level : (drafts[model.key] ?? value.thinkingLevel))
  const levelOf = (model: PickerModel<ThinkingLevel>) => chosen(model) ?? model.steps[0]

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setDrafts({})
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" aria-label="Model" className="min-w-0" />}>
        {selected ? (
          <span className="relative -ml-0.5 flex shrink-0">
            <BrandIcon provider={familyOf(selected.name) ?? selected.provider} name={selected.provider} className="mx-0! size-(--icon-sm)" />
          </span>
        ) : null}
        <span className="min-w-0 truncate">{selected?.name ?? emptyLabel}</span>
        {showLevel && shownLevel ? <span className="text-muted-foreground-2">{titleCase(shownLevel)}</span> : null}
        <ChevronDown className="size-(--icon-sm) shrink-0 text-muted-foreground-3" />
      </PopoverTrigger>
      <PopoverContent side={side} align="start">
        <ModelPickerPanel
          groups={groups}
          selected={value.model}
          step={levelOf}
          stepLabel={titleCase}
          onSelect={(model) => {
            onChange({ model: model.key, thinkingLevel: chosen(model) })
            setOpen(false)
          }}
          onStep={(model, next) => {
            if (model.key === value.model) onChange({ model: value.model, thinkingLevel: next })
            else setDrafts((current) => ({ ...current, [model.key]: next }))
          }}
          empty={
            <span className="flex flex-col gap-1">
              No provider is connected yet
              <Link to="/settings/$section" params={{ section: "models" }} className="text-(--text-link) underline-offset-2 hover:underline">
                Add a provider key
              </Link>
            </span>
          }
        />
      </PopoverContent>
    </Popover>
  )
}
