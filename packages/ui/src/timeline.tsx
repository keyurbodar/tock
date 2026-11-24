import { ArrowDown02Icon } from "@hugeicons/core-free-icons"
import type { ReactNode } from "react"
import { cn } from "./cn"
import { Icon } from "./icon"

export const ROW = "mx-auto w-full max-w-4xl min-w-0 px-4 pt-(--row-gap) max-md:pt-(--row-gap-narrow)"

export function ChatStamp({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="chat-stamp"
      className="flex min-h-7 items-center justify-center text-xs text-muted-foreground-2 tabular-nums select-none mb-3 max-md:mb-2.5"
    >
      {children}
    </div>
  )
}

export function ScrollToEnd({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <div
      inert={!visible}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-(--z-top-bar) flex justify-center transition-[opacity,translate] duration-fast ease-out-quint motion-reduce:transition-none",
        visible ? "opacity-100" : "translate-y-1 opacity-0",
      )}
    >
      <div className="pointer-events-auto flex flex-col rounded-(--radius-card) border-[0.5px] border-(--card-hairline) bg-card shadow-card">
        <button
          type="button"
          aria-label="Scroll to end"
          onClick={onClick}
          className="relative flex h-7 cursor-pointer items-center justify-center gap-1 rounded-(--radius-card) px-2.5 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:outline-ring-inset [&_svg]:size-(--icon-sm) [&_svg]:shrink-0"
        >
          <Icon icon={ArrowDown02Icon} />
          <span>Scroll to end</span>
        </button>
      </div>
    </div>
  )
}

export function ProgressEdge({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-active={active}
      data-sweeping={active}
      data-slot="progress-edge"
      className={cn(
        "progress-edge pointer-events-none absolute inset-x-0 top-0 z-(--z-top-bar) h-px bg-(--primary-soft) transition-opacity duration-fast ease-out",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  )
}
