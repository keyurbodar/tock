import { createFileTreeIconResolver, getBuiltInSpriteSheet } from "@pierre/trees"
import { fileHueColor, fileTokenHue } from "@tock/theme/file-hues"
import { useEffect } from "react"
import { cn } from "./cn"

const SET = "complete"
const SPRITE_ID = "file-icon-sprite"
const resolver = createFileTreeIconResolver(SET)

const mountSprite = () => {
  const existing = document.getElementById(SPRITE_ID)
  if (existing?.dataset.iconSet === SET) return
  const sprite = existing ?? document.createElement("div")
  sprite.id = SPRITE_ID
  sprite.dataset.iconSet = SET
  sprite.style.display = "none"
  sprite.innerHTML = getBuiltInSpriteSheet(SET)
  if (existing === null) document.body.append(sprite)
}

export function FileIcon({ name, className }: { name: string; className?: string }) {
  useEffect(mountSprite, [])
  const icon = resolver.resolveIcon("file-tree-icon-file", name)
  const hue = icon.token === undefined ? undefined : fileTokenHue[icon.token]
  return (
    <svg
      aria-hidden="true"
      viewBox={icon.viewBox ?? "0 0 16 16"}
      className={cn("size-4 shrink-0", hue === undefined && "text-icon-muted", className)}
      style={hue === undefined ? undefined : { color: fileHueColor(hue) }}
    >
      <use href={`#${icon.name}`} />
    </svg>
  )
}
