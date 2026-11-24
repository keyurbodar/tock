import { Button } from "@tock/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@tock/ui/dialog"
import { useState, type ReactNode } from "react"

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Save",
  destructive,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel?: string
  destructive?: boolean
  onSubmit: () => Promise<boolean>
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            const done = await onSubmit()
            setBusy(false)
            if (done) onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children ? <DialogBody>{children}</DialogBody> : <div className="pb-2" />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" intent={destructive ? "danger" : "accent"} disabled={busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  label: string
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit items-center gap-0.5 rounded-(--radius) bg-secondary p-0.5">
      {options.map((option) => (
        <Button
          key={option.value}
          role="radio"
          variant="segmented"
          aria-checked={option.value === value}
          selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
