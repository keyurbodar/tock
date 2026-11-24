import { toast } from "sonner"

const REVOKE_AFTER = 60_000

const blobOf = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    return response.blob()
  })

async function png(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.convertToBlob({ type: "image/png" })
}

export function copyImage(url: string) {
  navigator.clipboard.write([new ClipboardItem({ "image/png": blobOf(url).then(png) })]).then(
    () => toast.success("Image copied"),
    () => toast.error("Could not copy image"),
  )
}

export function downloadMedia(url: string, name: string) {
  blobOf(url).then(
    (blob) => {
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER)
    },
    () => toast.error("Could not download file"),
  )
}
