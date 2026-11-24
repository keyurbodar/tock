export interface SkillText {
  readonly head: string
  readonly entries: readonly { readonly key: string | undefined; readonly lines: readonly string[] }[]
  readonly name: string
  readonly description: string
  readonly body: string
}

export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

export const skillSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "")
    .slice(0, 64)

const scalar = (lines: readonly string[]) => {
  const first = /^[A-Za-z][\w-]*:\s*(.*)$/.exec(lines[0] ?? "")?.[1]?.trim() ?? ""
  const rest = lines.slice(1).map((line) => line.trim())
  if (/^[>|][+-]?\d?$/.test(first)) return rest.join(first.startsWith("|") ? "\n" : " ").trim()
  const joined = [first, ...rest].filter((part) => part !== "").join(" ")
  const double = /^"((?:[^"\\]|\\.)*)"$/.exec(joined)?.[1]
  if (double !== undefined) return double.replace(/\\(.)/g, (_, char: string) => (char === "n" ? "\n" : char === "t" ? "\t" : char))
  const single = /^'((?:[^']|'')*)'$/.exec(joined)?.[1]
  return single === undefined ? joined : single.replaceAll("''", "'")
}

const entry = (key: string, value: string) =>
  value.includes("\n")
    ? [`${key}: |-`, ...value.split("\n").map((line) => (line === "" ? "" : `  ${line}`))].join("\n")
    : /^[A-Za-z(][^:#]*$/.test(value) && !/\s$/.test(value) && !/^(?:true|false|null|yes|no|on|off)$/i.test(value)
      ? `${key}: ${value}`
      : `${key}: ${JSON.stringify(value)}`

export const parseSkill = (text: string): SkillText => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (match === null) return { head: "", entries: [], name: "", description: "", body: text }
  const entries: { key: string | undefined; lines: string[] }[] = []
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const key = /^([A-Za-z][\w-]*):/.exec(line)?.[1]
    const last = entries.at(-1)
    if (key === undefined && last?.key !== undefined && (line.trim() === "" || /^\s/.test(line))) last.lines.push(line)
    else entries.push({ key, lines: [line] })
  }
  const rest = text.slice(match[0].length)
  const gap = /^(?:[ \t]*\r?\n)*/.exec(rest)?.[0] ?? ""
  const read = (key: string) => {
    const found = entries.find((item) => item.key === key)
    return found === undefined ? "" : scalar(found.lines)
  }
  return { head: match[0] + gap, entries, name: read("name"), description: read("description"), body: rest.slice(gap.length) }
}

export const composeSkill = (parsed: SkillText, name: string, description: string, body: string) => {
  const renamed = name !== parsed.name
  const described = description !== parsed.description
  if (!renamed && !described) return parsed.head + body
  const line = (key: string, value: string) => (value === "" ? [] : [entry(key, value)])
  const keys = new Set(parsed.entries.map((item) => item.key))
  const lines = [
    ...(keys.has("name") || !renamed ? [] : line("name", name)),
    ...(keys.has("description") ? [] : line("description", description)),
    ...parsed.entries.flatMap((item) =>
      item.key === "name" && renamed ? line("name", name) : item.key === "description" && described ? line("description", description) : item.lines,
    ),
  ]
  return lines.length === 0 ? body : `---\n${lines.join("\n")}\n---\n\n${body}`
}
