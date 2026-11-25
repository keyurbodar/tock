import type { ReactNode, Ref } from "react"
import { cn } from "../cn"
import { Check, glyphs } from "../glyph"

export interface CommandItem {
  readonly id: string
  readonly label: string
  readonly icon?: ReactNode
  readonly trailing?: ReactNode
  readonly selected?: boolean
  readonly group?: string
  readonly searchTerms?: readonly string[]
  readonly insert?: string
}

interface CommandBase {
  readonly name: string
  readonly label: string
  readonly icon: ReactNode
  readonly aliases?: readonly string[]
  readonly searchTerms?: readonly string[]
}

export type Command =
  | (CommandBase & { readonly kind: "action"; readonly run: () => void; readonly active?: boolean })
  | (CommandBase & { readonly kind: "insert"; readonly text: string })
  | (CommandBase & {
      readonly kind: "picker"
      readonly items: readonly CommandItem[]
      readonly select: (item: CommandItem) => void
      readonly emptyLabel: string
      readonly loading?: boolean
      readonly run?: () => void
      readonly inline?: boolean
    })

export type PickerCommand = Extract<Command, { kind: "picker" }>

export type CommandRow =
  | { readonly type: "back" }
  | { readonly type: "command"; readonly command: Command }
  | { readonly type: "item"; readonly command: PickerCommand; readonly item: CommandItem }

const SURFACE = "rounded-(--radius-overlay) border-[0.5px] border-border-2 bg-popover p-1 text-foreground shadow-overlay"
const SCROLLER = "-m-1 min-h-0 overflow-x-hidden overflow-y-auto p-1 md:scroll-fade-y"
const HEADER = "mt-1 flex min-h-[22px] items-center px-2 text-xs font-medium text-muted-foreground-2 first:mt-0"
const ROW =
  "relative flex w-full min-w-0 cursor-pointer items-center gap-2 rounded px-2 text-left text-sm font-normal outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm) h-(--h-menu-row) data-[highlighted]:bg-[var(--menu-row-highlight,var(--popover-hover))] data-[popup-open]:bg-[var(--menu-row-highlight,var(--popover-hover))] text-foreground"
const ICON = "flex size-(--icon-sm) shrink-0 items-center justify-center text-icon-muted in-data-[intent=danger]:text-destructive"
const TRAILING = "ml-auto flex shrink-0 items-center gap-1.5 text-sm font-normal text-muted-foreground-1"
const NOTE = "px-2 py-4 text-center text-sm font-normal text-muted-foreground-2"

const chevron = (
  <svg className="size-(--icon-sm) shrink-0 text-muted-foreground-3" aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none">
    <path d="M10 16L12.9393 13.0607C13.5251 12.4749 13.5251 11.5251 12.9393 10.9393L10 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const check = <Check className="size-(--icon-sm) shrink-0 text-foreground" />

const rowKey = (row: CommandRow) =>
  row.type === "back" ? "back" : row.type === "command" ? `command:${row.command.name}` : `item:${row.command.name}:${row.item.id}`

export const commandRowId = (index: number) => `tock-command-row-${index}`

function RowContent({ row }: { row: CommandRow }) {
  if (row.type === "back") {
    return (
      <>
        <span className={ICON}>{glyphs.previous}</span>
        <span className="min-w-0 truncate">Back to commands</span>
        <span className={TRAILING}>Backspace</span>
      </>
    )
  }
  if (row.type === "item") {
    return (
      <>
        <span className={ICON}>{row.item.icon}</span>
        <span className="min-w-0 truncate">{row.item.label}</span>
        <span className={cn(TRAILING, "flex items-center gap-2")}>
          {row.item.trailing}
          {row.item.selected ? check : null}
        </span>
      </>
    )
  }
  const { command } = row
  return (
    <>
      <span className={ICON}>{command.icon}</span>
      <span className="min-w-0 truncate">{command.label}</span>
      <span className={cn(TRAILING, "flex items-center gap-2")}>
        {command.kind === "picker" ? (
          <>
            {command.run === undefined ? null : `/${command.name}`}
            {chevron}
          </>
        ) : (
          <>
            {`/${command.name}`}
            {command.kind === "action" && command.active === true ? check : null}
          </>
        )}
      </span>
    </>
  )
}

export function CommandMenuSurface({
  rows,
  command,
  loading,
  empty,
  highlight,
  headers,
  onSelect,
  onHighlight,
  highlightedRef,
  maxHeight = 320,
}: {
  rows: readonly CommandRow[]
  command: string | null
  loading: boolean
  empty: string | null
  highlight: number
  headers?: ReadonlyMap<number, string>
  onSelect?: (row: CommandRow) => void
  onHighlight?: (index: number) => void
  highlightedRef?: Ref<HTMLDivElement>
  maxHeight?: number
}) {
  return (
    <div role="listbox" id="tock-command-menu" className={cn(SURFACE, "flex flex-col overflow-hidden")} style={{ width: 320, maxHeight }}>
      <div role="presentation" className={SCROLLER}>
        {command !== null && rows.length > 0 ? <div className={HEADER}>{`/${command}`}</div> : null}
        {rows.map((row, index) => {
          const active = index === highlight
          const header = headers?.get(index)
          return (
            <div key={rowKey(row)}>
              {header === undefined ? null : <div className={HEADER}>{header}</div>}
              <div
                ref={active ? highlightedRef : undefined}
                id={commandRowId(index)}
                role="option"
                aria-selected={active}
                data-highlighted={active ? "" : undefined}
                className={ROW}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect?.(row)
                }}
                onMouseEnter={() => onHighlight?.(index)}
              >
                <RowContent row={row} />
              </div>
            </div>
          )
        })}
        {loading && !rows.some((row) => row.type !== "back") ? <div className={NOTE}>Loading…</div> : empty === null ? null : <div className={NOTE}>{empty}</div>}
      </div>
    </div>
  )
}
