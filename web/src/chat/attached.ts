export interface AttachedRef {
  readonly name: string
  readonly id: string
}

const LINE = /^\[attached file: (.*) \(([^()\s]+)\)\]$/

const line = (file: AttachedRef) => `[attached file: ${file.name} (${file.id})]`

export const withAttachments = (text: string, files: readonly AttachedRef[]) =>
  files.length === 0 ? text : `${text}\n\n${files.map(line).join("\n")}`

export function splitAttachments(message: string): { readonly text: string; readonly refs: readonly AttachedRef[] } {
  const lines = message.split("\n")
  const refs: AttachedRef[] = []
  while (lines.length > 0) {
    const match = LINE.exec(lines[lines.length - 1] ?? "")
    if (match === null || match[1] === undefined || match[2] === undefined) break
    refs.unshift({ name: match[1], id: match[2] })
    lines.pop()
  }
  if (refs.length === 0 || lines.at(-1) !== "") return { text: message, refs: [] }
  return { text: lines.slice(0, -1).join("\n"), refs }
}
