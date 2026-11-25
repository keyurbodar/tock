export function attachmentToken(id: string, name: string): string {
  return `[${name.replace(/[[\]\n\\]/g, "")}](attachment:${id})`
}

export function fileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path
}

export function linkTarget(path: string): string {
  return encodeURI(path).replace(/[()]/g, (char) => encodeURIComponent(char))
}
