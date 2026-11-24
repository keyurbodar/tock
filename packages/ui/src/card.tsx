import { createContext, use, type ComponentProps, type ReactNode } from "react"
import { cn } from "./cn"

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col overflow-clip bg-card rounded-(--radius-card) border-[0.5px] border-(--card-hairline) shadow-card divide-y-[0.5px] divide-border-1",
        className,
      )}
      {...props}
    />
  )
}

export function SettingsRow({
  id,
  title,
  description,
  children,
  stacked,
  fill,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  stacked?: boolean
  fill?: boolean
}) {
  const shrink = fill ? "shrink-0" : "min-w-0"
  return (
    <div
      data-slot="settings-row"
      id={id}
      className={cn("group/row flex gap-6 p-4", stacked ? "flex-col gap-3" : fill ? "items-center" : "items-center justify-between")}
    >
      <div className={cn("flex items-center gap-3", shrink)}>
        <div className={cn("flex flex-col gap-0.5", shrink)}>
          <div className="text-sm font-medium text-foreground">{title}</div>
          {description ? <div className="font-normal text-muted-foreground-2 text-sm">{description}</div> : null}
        </div>
      </div>
      {children ? (
        <div
          className={cn(
            "relative flex items-center gap-2",
            stacked ? "min-w-0" : fill ? "min-w-0 flex-1 justify-end" : "shrink-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

export const PageEmbedded = createContext(false)

export function Page({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  const embedded = use(PageEmbedded)
  const content = (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="font-medium text-foreground text-xl">{title}</h1>
            {description ? <p className="text-sm font-normal text-muted-foreground-1">{description}</p> : null}
          </div>
          {action}
        </div>
      </header>
      {children}
    </>
  )
  if (embedded) return <div className="flex flex-col gap-10">{content}</div>
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto md:scroll-fade-y">
      <div className="mx-auto flex w-full flex-col gap-10 px-6 pt-6 pb-10 md:pt-16 max-w-3xl">{content}</div>
    </div>
  )
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      {title || description || action ? (
        <div className="flex flex-col gap-1">
          {title ? (
            <div className="flex min-h-7 items-center justify-between gap-3">
              <h2 className="text-base font-medium text-foreground">{title}</h2>
              {description ? null : action}
            </div>
          ) : null}
          {description ? (
            <div className="flex min-h-7 items-center justify-between gap-3">
              <p className="text-sm font-normal text-muted-foreground-2">{description}</p>
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="-mx-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}

export function Empty({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? <div className="text-sm font-normal text-muted-foreground-2">{description}</div> : null}
      </div>
      {children}
    </div>
  )
}

export function ListCard({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div
      data-slot="card"
      className="flex flex-col overflow-visible rounded-(--radius-card) border-[0.5px] border-(--card-hairline) bg-card shadow-card"
    >
      <div
        data-slot="card-list-header"
        className={cn(
          "flex min-h-[60px] items-center justify-between gap-3 py-3 pr-2 pl-4",
          children ? "border-b-[0.5px] border-border-1" : "",
        )}
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</span>
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      </div>
      {children ? <div className="flex flex-col divide-y-[0.5px] divide-border-1">{children}</div> : null}
    </div>
  )
}

export function ListRow({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div data-slot="settings-row" className="group/row flex min-h-[60px] items-center justify-between gap-6 p-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-foreground [&_svg:not([class*='size-'])]:size-4">
            {icon}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          {description ? <div className="truncate text-xs font-normal text-muted-foreground-2">{description}</div> : null}
        </div>
      </div>
      {children ? <div className="relative flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="-mr-2 flex items-center gap-1">{children}</div>
}
