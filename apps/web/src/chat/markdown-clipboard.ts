/**
 * HTML clipboard to Markdown, ported from t3code apps/web/src/markdown-clipboard.ts (serializeNode, serializeTable, serializeList,
 * serializeBlockquote, escapeProse, tidyMarkdown). Dropped: t3's alerts, insights, details, math, mermaid and drive-path handling.
 */

const SKIPPED_TAGS = new Set(["BUTTON", "INPUT", "SCRIPT", "STYLE", "TEMPLATE", "META", "LINK", "TITLE"])
const LIST_ITEM_CHECKBOX = ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]'
const CODE_BOUNDARY = "\u0000"
const INLINE_MARKDOWN = /\\(?=[!-/:-@[-`{-~\n]|$)|[`[\]]|\*+|_+|~{2,}/g
const ESCAPED_PUNCTUATION = /\\([!-/:-@[-`{-~])/g

const isSkipped = (element: Element) => SKIPPED_TAGS.has(element.tagName) || element.localName === "svg" || element.getAttribute("aria-hidden") === "true"

function wrapInlineMarker(content: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)
  const core = match?.[2] ?? ""
  if (!core) return content
  return `${match?.[1] ?? ""}${marker}${core}${marker}${match?.[3] ?? ""}`
}

function wrapInlineCode(code: string): string {
  const longestRun = [...(code.match(/`+/g) ?? [])].reduce((max, run) => Math.max(max, run.length), 0)
  const fence = "`".repeat(Math.max(1, longestRun + (longestRun > 0 ? 1 : 0)))
  const spaceEdges = code.startsWith(" ") && code.endsWith(" ") && /[^ ]/.test(code)
  const pad = spaceEdges || code.startsWith("`") || code.endsWith("`") ? " " : ""
  return `${fence}${pad}${code}${pad}${fence}`
}

function codeFenceFor(code: string): string {
  const longestRun = [...(code.match(/`{3,}/g) ?? [])].reduce((max, run) => Math.max(max, run.length), 0)
  return "`".repeat(Math.max(3, longestRun + 1))
}

function serializeCodeBlock(pre: Element): string {
  const code = (pre.textContent ?? "").replace(/\n$/, "")
  const language = /language-([\w-]+)/.exec(pre.querySelector("code")?.className ?? pre.className)?.[1] ?? ""
  const fence = codeFenceFor(code)
  return `${CODE_BOUNDARY}${fence}${language}\n${code}\n${fence}${CODE_BOUNDARY}\n\n`
}

function outsideCode(markdown: string, tidy: (prose: string) => string): string {
  return markdown
    .split(CODE_BOUNDARY)
    .map((part, index) => (index % 2 === 1 ? `${CODE_BOUNDARY}${part}${CODE_BOUNDARY}` : tidy(part)))
    .join("")
}

function escapeProse(text: string): string {
  return text.replace(/\S+/g, (word, wordOffset: number) =>
    word.replace(INLINE_MARKDOWN, (match: string, offset: number) => {
      const before = text[wordOffset + offset - 1]
      const after = text[wordOffset + offset + match.length]
      if (match === "\\" && after !== undefined && /[^\S\n]/.test(after)) return match
      const between = (pattern: RegExp) => before !== undefined && after !== undefined && pattern.test(before) && pattern.test(after)
      if (/[*_~]/.test(match[0]!) && between(/\s/)) return match
      if (match[0] === "_" && between(/[\p{L}\p{N}]/u)) return match
      return match.replace(/[\s\S]/g, "\\$&")
    }),
  )
}

const escapeTablePipes = (text: string, inTableCell: boolean) => (inTableCell ? text.replaceAll("|", "\\|") : text)

function serializeTableCell(cell: Element): string {
  return serializeChildren(cell, true).replace(/\n+/g, " ").trim()
}

function tableSeparatorFor(headerCells: Element[]): string {
  const markers = headerCells.map((cell) => {
    const align = (cell as HTMLElement).style?.textAlign || cell.getAttribute("align") || ""
    if (align === "center") return ":---:"
    if (align === "right") return "---:"
    return "---"
  })
  return `| ${markers.join(" | ")} |`
}

function serializeTable(table: Element): string {
  const rows = [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr")]
  if (rows.length === 0) return ""
  const lines: string[] = []
  let emittedSeparator = false
  for (const row of rows) {
    const cells = [...row.children].filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
    if (cells.length === 0) continue
    lines.push(`| ${cells.map((cell) => serializeTableCell(cell)).join(" | ")} |`)
    if (!emittedSeparator) {
      lines.push(tableSeparatorFor(cells))
      emittedSeparator = true
    }
  }
  return `${lines.join("\n")}\n\n`
}

function serializeListItem(item: Element, ordered: boolean, index: number, inTableCell: boolean): string {
  const checkbox = item.querySelector<HTMLInputElement>(LIST_ITEM_CHECKBOX)
  const task = checkbox ? `[${checkbox.checked ? "x" : " "}] ` : ""
  const bullet = ordered ? `${index}. ` : "- "
  let content = outsideCode(serializeChildren(item, inTableCell), (prose) => prose.replace(/\n{3,}/g, "\n\n")).trim()
  if (!item.querySelector(":scope > p")) content = outsideCode(content, (prose) => prose.replace(/\n{2,}/g, "\n"))
  const continuationIndent = " ".repeat(bullet.length)
  const [first = "", ...rest] = content.split("\n")
  return [`${bullet}${task}${first}`, ...rest.map((line) => (line.length > 0 ? `${continuationIndent}${line}` : line))].join("\n")
}

function serializeList(list: Element, ordered: boolean, inTableCell: boolean): string {
  const start = Number.parseInt(list.getAttribute("start") ?? "1", 10)
  let next = Number.isNaN(start) ? 1 : start
  const items = [...list.children].filter((child) => child.tagName === "LI")
  if (items.length === 0) return ""
  return `${items.map((item) => serializeListItem(item, ordered, next++, inTableCell)).join("\n")}\n\n`
}

function serializeBlockquote(quote: Element, inTableCell: boolean): string {
  const content = outsideCode(serializeChildren(quote, inTableCell), (prose) => prose.replace(/\n{3,}/g, "\n\n")).trim()
  if (!content) return ""
  return `${content
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n")}\n\n`
}

function serializeAnchor(anchor: Element, inTableCell: boolean): string {
  const content = serializeChildren(anchor, inTableCell)
  const href = anchor.getAttribute("href") ?? ""
  if (!/^(?:https?:\/\/|mailto:)/i.test(href)) return content
  const label = content.trim()
  if (!label) return ""
  if (label.replace(ESCAPED_PUNCTUATION, "$1") === href) return escapeTablePipes(href, inTableCell)
  return `[${label}](${escapeTablePipes(href.replace(/[\\()]/g, "\\$&"), inTableCell)})`
}

function serializeChildren(node: Node, inTableCell = false): string {
  let out = ""
  for (const child of node.childNodes) out += serializeNode(child, inTableCell)
  return out
}

function serializeNode(node: Node, inTableCell = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = (node.textContent ?? "").replace(/\u00a0/g, " ")
    if (node.previousSibling?.nodeName === "BR") text = text.replace(/^\n/, "")
    if (text.includes("\n") && text.trim().length === 0) return "\n"
    return escapeTablePipes(escapeProse(text.replace(/[ \t]*\n[ \t]*/g, " ")), inTableCell)
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const element = node as Element
  if (isSkipped(element)) return ""
  const headingLevel = /^H([1-6])$/.exec(element.tagName)?.[1]
  if (headingLevel) return `${"#".repeat(Math.min(3, Number(headingLevel)))} ${serializeChildren(element, inTableCell).trim()}\n\n`
  switch (element.tagName) {
    case "BR":
      return "\n"
    case "HR":
      return "---\n\n"
    case "P":
      return `${serializeChildren(element, inTableCell).trim()}\n\n`
    case "PRE":
      return serializeCodeBlock(element)
    case "CODE":
      return wrapInlineCode(escapeTablePipes(element.textContent ?? "", inTableCell))
    case "STRONG":
    case "B":
      return wrapInlineMarker(serializeChildren(element, inTableCell), "**")
    case "EM":
    case "I":
      return wrapInlineMarker(serializeChildren(element, inTableCell), "*")
    case "DEL":
    case "S":
      return wrapInlineMarker(serializeChildren(element, inTableCell), "~~")
    case "A":
      return serializeAnchor(element, inTableCell)
    case "UL":
      return serializeList(element, false, inTableCell)
    case "OL":
      return serializeList(element, true, inTableCell)
    case "BLOCKQUOTE":
      return serializeBlockquote(element, inTableCell)
    case "TABLE":
      return escapeTablePipes(serializeTable(element), inTableCell)
    case "DIV":
    case "SECTION":
    case "ARTICLE": {
      const content = serializeChildren(element, inTableCell)
      return content && !content.endsWith("\n") ? `${content}\n` : content
    }
    default:
      return serializeChildren(element, inTableCell)
  }
}

function tidyMarkdown(markdown: string): string {
  const parts = markdown.split(CODE_BOUNDARY)
  const last = parts.length - 1
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part
      let prose = part.replace(/[ \t]+(?=\n)/g, "").replace(/\n{3,}/g, "\n\n")
      if (index === 0) prose = prose.trimStart()
      if (index === last) prose = prose.trimEnd()
      return prose
    })
    .join("")
}

/** Clipboard HTML as Markdown. */
export function htmlToMarkdown(html: string): string {
  const template = document.createElement("template")
  template.innerHTML = html
  return tidyMarkdown(serializeChildren(template.content))
}

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** Whether Markdown holds a GFM table: the composer has no table node, so tables stay as typed source. */
export const hasTable = (markdown: string) => markdown.split("\n").some((line, index, lines) => TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? ""))
