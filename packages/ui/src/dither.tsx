import { motion } from "@tock/theme/motion"
import { useEffect, useRef } from "react"
import { cn } from "./cn"

const D = motion.dither

export function Dither({
  from,
  to,
  start = 0,
  slant = 0,
  cell = D.cell,
  className,
}: {
  from: number
  to: number
  start?: number
  slant?: number
  cell?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const draw = () => {
      const columns = Math.ceil(canvas.offsetWidth / cell)
      const rows = Math.ceil(canvas.offsetHeight / cell)
      if (columns === 0 || rows === 0) return
      canvas.width = columns
      canvas.height = rows
      context.fillStyle = getComputedStyle(canvas).color
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          const down = (y + 0.5) / rows
          const along = (1 - Math.abs(slant)) * ((x + 0.5) / columns) + Math.abs(slant) * (slant < 0 ? 1 - down : down)
          const t = Math.min(1, Math.max(0, (along - start) / (1 - start)))
          const level = from + (to - from) * t * t * (3 - 2 * t)
          if (level > ((D.bayer[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16) context.fillRect(x, y, 1, 1)
        }
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [from, to, start, slant, cell])

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute [image-rendering:pixelated]", className)} />
}
