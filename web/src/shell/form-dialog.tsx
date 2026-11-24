import { Button } from "@tock/ui/button"
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from "@tock/ui/dialog"
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
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            const done = await onSubmit()
            setBusy(false)
            if (done) onOpenChange(false)
          }}
        >
          <DialogHeader title={title} description={description} />
          {children ? <DialogBody>{children}</DialogBody> : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="base" />}>Cancel</DialogClose>
            <Button type="submit" variant="solid" intent={destructive ? "destructive" : "accent"} size="base" disabled={busy}>
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
          variant="segment"
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
