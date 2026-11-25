import type { ReactNode } from "react"
import { Button } from "./button"
import { glyphs } from "./glyph"
import { Input, Label, Textarea } from "./input"

export interface VariableDraft {
  readonly name: string
  readonly value: string
  readonly description: string
}

export function VariableFields({
  fieldId,
  draft,
  onChange,
  onRemove,
  namePlaceholder,
  descriptionPlaceholder,
  error,
  children,
}: {
  fieldId: (field: "key" | "value" | "description") => string
  draft: VariableDraft
  onChange: (draft: VariableDraft) => void
  onRemove?: () => void
  namePlaceholder?: string
  descriptionPlaceholder?: string
  error?: string
  children?: ReactNode
}) {
  return (
    <div data-slot="variable-row" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex min-h-6 items-center justify-between">
          <Label htmlFor={fieldId("key")}>Key</Label>
          <Button variant="ghost" size="icon-xs" disabled={onRemove === undefined} aria-label="Remove variable" onClick={onRemove}>
            {glyphs.trash}
          </Button>
        </div>
        <Input
          id={fieldId("key")}
          autoComplete="off"
          spellCheck={false}
          placeholder={namePlaceholder}
          aria-invalid={error !== undefined || undefined}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
        {error === undefined ? null : <p className="text-xs font-normal text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId("value")}>Value</Label>
        <Textarea
          id={fieldId("value")}
          rows={1}
          autoComplete="off"
          spellCheck={false}
          placeholder="Enter a value"
          className="max-h-40"
          value={draft.value}
          onChange={(event) => onChange({ ...draft, value: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId("description")}>
          Description
          <span className="font-normal text-muted-foreground-2">Optional</span>
        </Label>
        <Input
          id={fieldId("description")}
          autoComplete="off"
          placeholder={descriptionPlaceholder}
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
        />
      </div>
      {children}
    </div>
  )
}

export function MaskedValueRow({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-3 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </div>
      <span className="min-w-0 truncate px-2 py-1 text-xs font-normal text-muted-foreground-3">••••••••••</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
