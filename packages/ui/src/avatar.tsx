export type AvatarSize = "xxs" | "xs" | "sm" | "base" | "md" | "lg" | "xl" | "hero"

export function Avatar({
  size,
  ground,
  character,
  alt,
}: {
  size: AvatarSize
  ground: string
  character: string
  alt: string
}) {
  return (
    <span className="tk-av" data-size={size}>
      <img className="tk-av-ground" src={ground} alt="" decoding="async" />
      <img className="tk-av-char" src={character} alt={alt} decoding="async" />
    </span>
  )
}
