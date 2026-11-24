import { createContext, use, type ComponentProps } from "react"
import { cn } from "./cn"

const LEAD =
  "max-md:min-w-auto max-md:first:sticky max-md:first:left-0 max-md:first:z-(--z-table-lead) max-md:in-data-scrolled:first:bg-[var(--table-lead-bg,var(--panel))] max-md:in-data-scrolled:first:shadow-[-0.5rem_0_0_var(--table-lead-bg,var(--panel)),0.5px_0_0_var(--border-1)] in-data-pin-lead:first:sticky in-data-pin-lead:first:left-0 in-data-pin-lead:first:z-(--z-table-lead) in-data-pin-lead:in-data-scrolled:first:bg-[var(--table-lead-bg,var(--panel))] in-data-pin-lead:in-data-scrolled:first:shadow-[-0.5rem_0_0_var(--table-lead-bg,var(--panel)),0.5px_0_0_var(--border-1)]"

const DENSITY = {
  directory: "[--table-row-h:50px]",
  pick: "[--table-row-h:44px]",
  compact: "[--table-row-h:32px]",
}

const InCard = createContext(false)

const responsive = (columns: string) =>
  columns
    .split(/\s+(?![^(]*\))/)
    .map((track, index) => {
      const fluid = /^minmax\(\s*0(?:px)?\s*,(.+)\)$/.exec(track)
      if (fluid) return `minmax(var(${index === 0 ? "--table-lead-min" : "--table-fluid-min"}),${fluid[1]})`
      const auto = /^minmax\(\s*([\d.]+(?:px|rem))\s*,\s*auto\s*\)$/.exec(track)
      return auto ? `minmax(var(--table-auto-min,${auto[1]}),auto)` : track
    })
    .join(" ")

export function Table({
  columns,
  density = "directory",
  card = false,
  className,
  ...props
}: ComponentProps<"div"> & { columns: string; density?: keyof typeof DENSITY; card?: boolean }) {
  const table = (
    <div
      role="table"
      style={{ gridTemplateColumns: responsive(columns) }}
      className={cn(
        "isolate grid w-full overflow-x-auto overscroll-x-contain px-4 [--table-fluid-min:0px] [--table-lead-min:0px] max-md:[--table-fluid-min:8rem] max-md:[--table-lead-min:10rem] max-md:[--table-auto-min:auto] max-md:[clip-path:inset(0_0_0_0.5rem)]",
        DENSITY[density],
        card && "[--table-lead-bg:var(--card)]",
        className,
      )}
      onScroll={(event) => event.currentTarget.toggleAttribute("data-scrolled", event.currentTarget.scrollLeft > 0)}
      {...props}
    />
  )
  if (!card) return table
  return (
    <InCard value={true}>
      <div
        data-slot="card"
        className="flex flex-col overflow-clip overflow-x-auto rounded-(--radius-card) border-[0.5px] border-(--card-hairline) bg-card py-2 shadow-card"
      >
        {table}
      </div>
    </InCard>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<"div">) {
  const filled = use(InCard)
  return (
    <div
      role="row"
      className={cn(
        "col-span-full grid h-8 grid-cols-subgrid items-center",
        filled &&
          "relative mb-0.5 [--table-lead-bg:var(--section)] before:absolute before:inset-y-0 before:-inset-x-2 before:rounded-(--radius-card) before:bg-section [&>*]:relative",
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ numeric, className, ...props }: ComponentProps<"div"> & { numeric?: boolean }) {
  return (
    <div
      role="columnheader"
      className={cn(
        "flex min-w-0 items-center gap-0.5 pr-4 text-xs font-normal whitespace-nowrap text-muted-foreground-1 select-none",
        LEAD,
        "in-data-pin-lead:first:[--table-lead-bg:var(--card)]",
        numeric && "justify-end",
        className,
      )}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="row"
      className={cn(
        "relative col-span-full grid grid-cols-subgrid before:absolute before:inset-y-0 before:-inset-x-2 before:rounded before:transition-colors before:duration-100 hover:before:bg-section",
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ numeric, className, ...props }: ComponentProps<"div"> & { numeric?: boolean }) {
  return (
    <div
      role="cell"
      className={cn(
        "relative flex min-h-[var(--table-row-h,50px)] min-w-0 items-center pr-4 text-xs font-normal text-muted-foreground-1",
        LEAD,
        numeric && "justify-end tabular-nums",
        className,
      )}
      {...props}
    />
  )
}
