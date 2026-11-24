import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { Children, cloneElement, isValidElement, type ComponentProps, type CSSProperties, type ReactElement } from "react"
import { cn } from "./cn"
import { DotGrid } from "./dot-grid"

const INTENT = {neutral:``,accent:`[--intent-bg:var(--primary)] [--intent-bg-soft:var(--primary-soft)] [--intent-bg-soft-hover:var(--primary-soft-hover)] [--intent-text:var(--primary-ink)] [--intent-text-on-bg:var(--primary-text)] [--intent-text-hover:var(--primary-ink)] [--intent-border:var(--border-2)] [--intent-border-solid:color-mix(in_oklch,var(--primary)_80%,black)] [--intent-highlight:oklch(1_0_0_/_0.12)] [--intent-bg-hover:var(--primary-soft)] [--intent-bg-solid-hover:color-mix(in_oklch,var(--primary)_92%,black)]`,danger:`[--intent-bg:var(--destructive)] [--intent-bg-soft:var(--destructive-soft)] [--intent-bg-soft-hover:var(--destructive-soft-hover)] [--intent-text:var(--destructive)] [--intent-text-on-bg:var(--destructive-text)] [--intent-text-hover:var(--destructive)] [--intent-border:var(--border-2)] [--intent-border-solid:color-mix(in_oklch,var(--destructive)_80%,black)] [--intent-highlight:oklch(1_0_0_/_0.12)] [--intent-bg-hover:var(--destructive-soft)] [--intent-bg-solid-hover:color-mix(in_oklch,var(--destructive)_92%,white)]`}

export const buttonVariants = cva([`cursor-pointer relative inline-flex items-center justify-center w-fit shrink-0 whitespace-nowrap rounded [text-box-trim:trim-both] text-nowrap`,`border-[0.5px] border-transparent font-medium`,`transition-colors duration-100 outline-none select-none`,`focus-visible:outline-ring-inset`,`pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2`,`disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55`,`[&_svg]:pointer-events-none [&_svg]:shrink-0`,`data-[selected]:bg-secondary data-[selected]:text-foreground`,`group/button`],{variants:{variant:{solid:`bg-[var(--intent-bg,var(--button))] border-[var(--intent-border-solid,var(--intent-border,var(--border-2)))] text-[var(--intent-text-on-bg,var(--fg))] [--focus-ring:var(--intent-text-on-bg,var(--ring))] shadow-[inset_0_1px_var(--intent-highlight,var(--highlight-top)),var(--sh-plate)] hover:bg-[var(--intent-bg-solid-hover,var(--button-hover))] active:shadow-none active:brightness-97`,soft:`bg-[var(--intent-bg-soft,var(--secondary))] text-[var(--intent-text,var(--fg))] hover:bg-[var(--intent-bg-soft-hover,var(--secondary-hover))] active:brightness-97`,ghost:`bg-transparent text-[var(--intent-text,var(--muted-foreground-1))] hover:text-[var(--intent-text-hover,var(--fg))] hover:bg-[var(--intent-bg-hover,var(--secondary))] data-[popup-open]:text-[var(--intent-text-hover,var(--fg))] active:brightness-97 data-[selected]:data-[unfocused]:bg-secondary/50 data-[selected]:data-[unfocused]:text-muted-foreground-1 data-[selected]:data-[unfocused]:hover:bg-secondary data-[selected]:data-[unfocused]:hover:text-foreground`,outline:`bg-transparent border-[var(--intent-border,var(--border-2))] text-[var(--intent-text,var(--fg))] hover:bg-[var(--intent-bg-hover,var(--secondary))] active:brightness-97`,link:`bg-transparent text-[var(--intent-text,var(--text-link))] hover:underline underline-offset-2 disabled:opacity-40`,bare:`bg-transparent text-[var(--intent-text,var(--muted-foreground-1))] hover:text-[var(--intent-text-hover,var(--fg))] data-[popup-open]:text-[var(--intent-text-hover,var(--fg))] data-[selected]:bg-transparent data-[selected]:text-[var(--intent-text-hover,var(--fg))] active:brightness-97 disabled:opacity-40`,inverse:`bg-[var(--intent-bg,var(--inverse))] text-[var(--intent-text-on-bg,var(--inverse-text))] hover:bg-[var(--intent-bg-solid-hover,var(--inverse-hover))] active:brightness-95 disabled:opacity-50 data-[selected]:bg-[var(--intent-bg,var(--inverse))] data-[selected]:text-[var(--intent-text-on-bg,var(--inverse-text))]`,segmented:`bg-transparent text-[var(--intent-text,var(--segmented-foreground))] hover:text-[var(--intent-text-hover,var(--fg))] active:brightness-97 data-[selected]:bg-[var(--intent-bg,var(--card))] data-[selected]:text-[var(--intent-text-hover,var(--fg))] data-[selected]:shadow-card`},intent:INTENT,size:{auto:`h-auto gap-1`,"auto-sm":`h-auto gap-1 text-sm`,"auto-xs":`h-auto gap-1 text-xs`,xs:`h-(--h-control-xs) px-2 text-xs gap-1.5 [&_svg:not([class*='size-'])]:size-(--icon-xs) [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5`,sm:`h-(--h-control-sm) px-2.5 md:px-2 text-xs gap-1.5 [&_svg:not([class*='size-'])]:size-(--icon-sm) [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5`,base:`h-(--h-control-base) px-3 md:px-2.5 text-sm gap-2 [&_svg:not([class*='size-'])]:size-(--icon-base) [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5`,lg:`h-(--h-control-lg) px-4 text-sm gap-2 [&_svg:not([class*='size-'])]:size-(--icon-base) [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5`,"icon-xs":`size-(--h-control-xs) [&_svg:not([class*='size-'])]:size-(--icon-xs)`,"icon-sm":`size-(--h-control-sm) [&_svg:not([class*='size-'])]:size-(--icon-sm)`,"icon-sm-narrow":`h-(--h-control-sm) px-1 [&_svg:not([class*='size-'])]:size-(--icon-sm)`,"icon-base":`size-(--h-control-base) [&_svg:not([class*='size-'])]:size-(--icon-base)`,"icon-shrink":`inline-flex [&_svg:not([class*='size-'])]:size-(--icon-sm)`},shape:{default:``,"segment-start":`rounded-r-none border-r-0 shadow-none`,"segment-end":`rounded-l-none shadow-none`}},defaultVariants:{variant:`solid`,intent:`neutral`,size:`sm`,shape:`default`}})

export type ButtonVariants = VariantProps<typeof buttonVariants>

type IconSide = "leading" | "trailing" | "only"

export function ButtonIcon({
  children,
  className,
  loading = false,
  side = "leading",
}: {
  children: ReactElement<{ className?: string; style?: CSSProperties }>
  className?: string
  loading?: boolean
  side?: IconSide
}) {
  const inner = cn(children.props.className, className)
  const style = { ...children.props.style, margin: 0 }
  return (
    <span
      data-slot="button-icon"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        side === "only" ? "-mx-0.5" : side === "leading" ? "-ml-0.5" : "-mr-0.5",
        className,
      )}
    >
      {loading ? (
        <DotGrid size="inherit" tone={false} className={inner} style={style} aria-hidden />
      ) : (
        cloneElement(children, { className: inner || undefined, style })
      )}
    </span>
  )
}

const SPINNER = <DotGrid size="inherit" tone={false} aria-hidden />

const content = (children: ComponentProps<"button">["children"], loading: boolean, loadingLabel: string | undefined) => {
  if (loading && loadingLabel != null) {
    return (
      <>
        {SPINNER}
        {loadingLabel}
      </>
    )
  }
  const items = Children.toArray(children)
  const first = items[0]
  const lead = isValidElement<ComponentProps<typeof ButtonIcon>>(first) && first.type === ButtonIcon ? first : undefined
  if (lead === undefined) {
    return loading ? (
      <>
        {SPINNER}
        {children}
      </>
    ) : (
      children
    )
  }
  const side = lead.props.side ?? (items.length === 1 ? "only" : "leading")
  return [cloneElement(lead, loading ? { loading: true, side } : { side }), ...items.slice(1)]
}

export function Button({
  className,
  variant,
  intent,
  size,
  shape,
  render,
  loading = false,
  loadingLabel,
  selected,
  disabled,
  children,
  ...props
}: ComponentProps<"button"> &
  ButtonVariants & {
    render?: useRender.RenderProp
    loading?: boolean
    loadingLabel?: string
    selected?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    render,
    props: {
      "data-slot": "button",
      "data-selected": selected ? "" : undefined,
      ...mergeProps<"button">(
        {
          className: cn(buttonVariants({ variant, intent, size, shape, className })),
          disabled: disabled || loading,
          "aria-busy": loading || undefined,
          children: render ? children : content(children, loading, loadingLabel),
        },
        render ? {} : { type: "button" },
        props,
      ),
    },
  })
}
