import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

export type IconData = IconSvgElement

export function Icon({ icon, alt, showAlt }: { icon: IconData; alt?: IconData; showAlt?: boolean }) {
  return <HugeiconsIcon icon={icon} altIcon={alt} showAlt={showAlt} strokeWidth={1.5} aria-hidden="true" />
}
