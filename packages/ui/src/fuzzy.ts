const SCORE = { exact: 1000, prefix: 800, word: 600, substring: 400, fuzzy: 200 } as const
const SECONDARY = 0.5
const MAX_RUNS = 3

type Tier = keyof typeof SCORE
interface Hit {
  readonly tier: Tier
  readonly score: number
  readonly start: number
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ")
const wordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char)

const boundary = (text: string, at: number) => {
  if (at === 0) return true
  const before = text[at - 1]
  const here = text[at] ?? ""
  if (!wordChar(before) || (/\p{Lu}/u.test(here) && /\p{Ll}/u.test(before ?? ""))) return true
  return /\p{N}/u.test(here) !== /\p{N}/u.test(before ?? "")
}

const indexes = (text: string, term: string) => {
  const found: number[] = []
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + 1)) found.push(at)
  return found
}

const closeness = (term: string, text: string, at: number) =>
  Math.round((term.length / Math.max(text.length, 1)) * 60) + Math.max(0, 20 - Math.min(at, 20))

const direct = (text: string, lower: string, term: string): Hit | undefined => {
  if (lower === term) return { tier: "exact", score: SCORE.exact, start: 0 }
  const found = indexes(lower, term)
  const first = found[0]
  if (first === undefined) return undefined
  const word = found.find((at) => boundary(text, at))
  if (first === 0) return { tier: "prefix", score: SCORE.prefix + closeness(term, text, 0), start: 0 }
  if (word !== undefined) return { tier: "word", score: SCORE.word + closeness(term, text, word), start: word }
  if (term.length < 2) return undefined
  return { tier: "substring", score: SCORE.substring + closeness(term, text, first), start: first }
}

const words = (text: string, lower: string, term: string): Hit | undefined => {
  const parts = term.split(" ").filter((part) => part !== "")
  if (parts.length < 2) return undefined
  const hits = parts.flatMap((part) => direct(text, lower, part) ?? [])
  if (hits.length < parts.length) return undefined
  const tier = hits.some((hit) => hit.tier === "substring") ? "substring" : "word"
  return { tier, score: SCORE[tier] + Math.round(closeness(term, text, 0) / 2), start: Math.min(...hits.map((hit) => hit.start)) }
}

const scattered = (text: string, lower: string, term: string): Hit | undefined => {
  if (term.length < 2 || term.includes(" ")) return undefined
  const runs: Array<{ start: number; end: number }> = []
  let from = 0
  let at = 0
  while (at < term.length) {
    let start = -1
    for (let next = lower.indexOf(term[at] ?? "", from); next !== -1; next = lower.indexOf(term[at] ?? "", next + 1)) {
      if (boundary(text, next)) {
        start = next
        break
      }
    }
    if (start === -1) return undefined
    let end = start
    while (at < term.length && lower[end] === term[at]) {
      end += 1
      at += 1
    }
    runs.push({ start, end })
    if (runs.length > MAX_RUNS) return undefined
    from = end
  }
  if (runs.slice(0, -1).some((run) => run.end - run.start < 2) && runs.some((run) => run.end - run.start > 1)) return undefined
  const first = runs[0]?.start ?? 0
  return { tier: "fuzzy", score: SCORE.fuzzy + Math.max(0, 60 - runs.length * 15) + Math.round(closeness(term, text, first) / 2), start: first }
}

const hit = (text: string, query: string): Hit | undefined => {
  const term = normalize(query)
  if (term === "" || text === "") return undefined
  const lower = text.toLowerCase()
  if (lower.length !== text.length) return lower.includes(term) ? hit(lower, term) : undefined
  return direct(text, lower, term) ?? words(text, lower, term) ?? scattered(text, lower, term)
}

const across = (fields: readonly string[], query: string, primary: number) => {
  const parts = normalize(query).split(" ")
  if (parts.length < 2) return undefined
  const found = parts.map((part) =>
    fields.findIndex((field) => {
      const match = hit(field, part)
      return match !== undefined && match.tier !== "substring" && match.tier !== "fuzzy"
    }),
  )
  if (found.some((field) => field === -1)) return undefined
  return Math.max(...found) < primary ? SCORE.word : Math.round(SCORE.word * SECONDARY)
}

const score = (fields: readonly string[], query: string, primary: number) =>
  fields.reduce<number | undefined>((best, field, at) => {
    const match = hit(field, query)
    if (match === undefined || (at >= primary && (match.tier === "substring" || match.tier === "fuzzy"))) return best
    const value = at < primary ? match.score : Math.round(match.score * SECONDARY)
    return best !== undefined && best >= value ? best : value
  }, undefined) ?? across(fields, query, primary)

export const matches = (fields: readonly string[], query: string) =>
  normalize(query) === "" || score(fields, query, fields.length) !== undefined

export const rank = <Item>(items: readonly Item[], fields: (item: Item) => readonly string[], query: string, primary = 1): readonly Item[] => {
  if (normalize(query) === "") return items
  return items
    .flatMap((item, index) => {
      const value = score(fields(item), query, primary)
      return value === undefined ? [] : [{ item, index, value }]
    })
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map((entry) => entry.item)
}
