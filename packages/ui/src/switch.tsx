import { Switch as SwitchRoot, SwitchThumb } from "@ui-sdk/react/switch"
import type { ComponentProps } from "react"
import { cn } from "./cn"

const TRACK =
  "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-[0.5px] border-border-2 bg-muted p-[1.5px] outline-none transition-colors duration-fast focus-visible:outline-ring-inset data-[checked]:border-transparent data-[checked]:bg-primary data-[checked]:[--focus-ring:var(--primary-text)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55 pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2"

const THUMB =
  "size-3 rounded-full bg-primary-foreground shadow-plate transition-transform duration-fast ease-out-quint data-[checked]:translate-x-3 motion-reduce:transition-none"

export function Switch({ className, ...props }: ComponentProps<typeof SwitchRoot>) {
  return (
    <SwitchRoot className={cn(TRACK, className)} {...props}>
      <SwitchThumb className={THUMB} />
    </SwitchRoot>
  )
}
