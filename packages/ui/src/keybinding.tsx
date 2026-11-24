import type { ComponentProps } from "react"
import { cn } from "./cn"
import { Kbd } from "./kbd"

export function KeyCaps({ parts }: { parts: readonly string[] }) {
  return (
    <span className="flex items-center gap-1">
      {parts.map((part, index) => (
        <Kbd key={index} variant="chip">
          {part}
        </Kbd>
      ))}
    </span>
  )
}

export function KeybindingButton({
  bindings,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & { bindings: readonly (readonly string[])[] }) {
  return (
    <button
      type="button"
      className={cn(
        "group/binding -ml-1.5 flex h-7 cursor-pointer items-center gap-1.5 rounded px-1.5 transition-colors duration-100 outline-none select-none hover:bg-secondary focus-visible:outline-ring-inset",
        className,
      )}
      {...props}
    >
      {bindings.length > 0 ? (
        bindings.map((parts) => <KeyCaps key={parts.join(" ")} parts={parts} />)
      ) : (
        <span className="text-xs font-normal text-muted-foreground-3">Unassigned</span>
      )}
      <span className="text-xs font-normal text-transparent transition-colors duration-100 group-hover/binding:text-muted-foreground-2 group-focus-visible/binding:text-muted-foreground-2">
        Edit
      </span>
    </button>
  )
}
