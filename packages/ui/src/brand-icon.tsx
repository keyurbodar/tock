import { BRAND_FAMILIES, BRAND_MARKS } from "./brand-marks"
import { cn } from "./cn"

const KEYS = Object.keys(BRAND_MARKS).sort((a, b) => b.length - a.length)
const word = (text: string) => /^[a-z]+/.exec(text.toLowerCase())?.[0] ?? ""
const family = (text: string) => BRAND_FAMILIES[word(text)]

export const brandOf = (provider: string): string | undefined => {
  const id = provider.toLowerCase()
  return KEYS.find((key) => id === key || id.startsWith(`${key}-`)) ?? family(id)
}

export const familyOf = (modelName: string): string | undefined => family(modelName)

export const modelMarkOf = (modelName: string): string | undefined =>
  word(modelName) in BRAND_MARKS ? word(modelName) : family(modelName)

export function BrandIcon({ provider, name, className }: { provider: string; name: string; className?: string }) {
  const brand = brandOf(provider)
  const mark = brand === undefined ? undefined : BRAND_MARKS[brand]
  if (mark === undefined) {
    return (
      <span className={cn("flex items-center justify-center rounded-(--radius-inner) bg-popover-hover text-2xs font-medium text-muted-foreground", className)}>
        {name.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <svg fill="currentColor" fillRule="evenodd" viewBox={mark.viewBox} xmlns="http://www.w3.org/2000/svg" className={className}>
      <title>{mark.title}</title>
      {mark.paths}
    </svg>
  )
}
