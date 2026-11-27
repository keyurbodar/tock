import type { PDFDocumentProxy } from "pdfjs-dist"

let lib: Promise<typeof import("pdfjs-dist")> | undefined
/** pdf.js and its worker load only when a PDF is on screen. */
const pdfjs = () =>
  (lib ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([pdf, worker]) => {
    pdf.GlobalWorkerOptions.workerSrc = worker.default
    return pdf
  }))

export const openPdf = async (url: string): Promise<PDFDocumentProxy> => (await pdfjs()).getDocument({ url }).promise

/** Draws one page at a CSS width, sharp on retina. */
export async function renderPage(doc: PDFDocumentProxy, number: number, width: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(number)
  const scale = (width * devicePixelRatio) / page.getViewport({ scale: 1 }).width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  canvas.style.width = `${width}px`
  await page.render({ canvas, viewport }).promise
  return canvas
}

const thumbs = new Map<string, Promise<string | null>>()
/** The first page as an image URL, rendered once per file and shared by every card that shows it. */
export function pdfThumb(url: string, width: number): Promise<string | null> {
  const known = thumbs.get(url)
  if (known) return known
  const made = openPdf(url)
    .then((doc) => renderPage(doc, 1, width))
    .then((canvas) => new Promise<string | null>((done) => canvas.toBlob((blob) => done(blob ? URL.createObjectURL(blob) : null))))
    .catch(() => null)
  thumbs.set(url, made)
  return made
}
