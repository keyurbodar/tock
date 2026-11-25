import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"
import { cn } from "./cn"

const kbdVariants = cva(
  "pointer-events-none inline-flex items-center justify-center gap-0.5 font-sans text-xs font-normal text-muted-foreground-1 select-none",
  {
    variants: {
      variant: {
        default: "",
        chip: "h-4 min-w-4 rounded-(--radius-kbd) bg-secondary px-1",
        onFill: "h-4 min-w-4 rounded-(--radius-kbd) bg-current/15 px-1 text-current/80",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export function Kbd({ className, variant, ...props }: ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return <kbd data-slot="kbd" className={cn(kbdVariants({ variant }), className)} {...props} />
}
