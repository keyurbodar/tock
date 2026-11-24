import type { ComponentProps, ReactNode } from "react"
import { cn } from "./cn"

export function ComposerSurface({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className="relative rounded-(--radius-card)">
      <div
        data-slot="composer"
        className={cn(
          "@container/composer relative rounded-(--radius-card) bg-[color:color-mix(in_srgb,var(--composer-surface,var(--card))_calc(var(--composer-opacity,1)*100%),transparent)] p-3 shadow-composer",
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-(--radius-card) border-[0.5px] border-transparent [background:linear-gradient(180deg,var(--border-2),var(--border-1))] [mask:linear-gradient(#000,#000)_padding-box_exclude,linear-gradient(#000,#000)_border-box]"
        />
        {children}
      </div>
    </div>
  )
}

export function ComposerToolbar({ leading, trailing }: { leading: ReactNode; trailing: ReactNode }) {
  return (
    <div className="-mx-1 -mb-1 flex items-center gap-2 pt-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5">{leading}</div>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </div>
  )
}
