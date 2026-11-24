import { ShikiStreamTokenizer } from "@shikijs/stream"
import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  getTokenStyleObject,
  type Highlighter,
  stringifyTokenStyle,
  type ThemedToken,
  type ThemeRegistration,
} from "shiki"
import type { HighlightRequest, Token, WorkerRequest, WorkerResponse } from "./protocol"
import dark from "./theme-dark.json"
import light from "./theme-light.json"

type Job = { type: "highlight"; key: string; request: HighlightRequest | undefined } | { type: "dispose"; key: string }

interface Stream {
  language: string
  source: string
  tokenizer: ShikiStreamTokenizer
}

const THEMES = { light: light.name, dark: dark.name }
const streams = new Map<string, Stream>()
let highlighter: Promise<Highlighter> | undefined

const ready = () => {
  highlighter ??= createHighlighter({ themes: [light as ThemeRegistration, dark as ThemeRegistration], langs: [] })
  return highlighter
}

const post = (response: WorkerResponse) => self.postMessage(response)

const token = (item: ThemedToken): Token => [item.content, stringifyTokenStyle(item.htmlStyle ?? getTokenStyleObject(item))]

const isBundled = (language: string): language is BundledLanguage => language in bundledLanguages

async function run(request: HighlightRequest) {
  const shiki = await ready()
  const language = isBundled(request.language) ? request.language : "text"
  if (language !== "text" && !shiki.getLoadedLanguages().includes(language)) await shiki.loadLanguage(bundledLanguages[language])
  if (request.complete) {
    const { tokens } = shiki.codeToTokens(request.text, { lang: language, themes: THEMES, defaultColor: false })
    streams.delete(request.key)
    post({
      type: "highlight",
      id: request.id,
      key: request.key,
      reset: true,
      stable: tokens.flatMap((line, index) => (index === tokens.length - 1 ? line : [...line, { content: "\n", offset: 0 }])).map(token),
      unstable: [],
    })
    return
  }
  const previous = streams.get(request.key)
  const reset = previous === undefined || previous.language !== language || !request.text.startsWith(previous.source)
  const stream =
    reset || previous === undefined
      ? { language, source: "", tokenizer: new ShikiStreamTokenizer({ highlighter: shiki, lang: language, themes: THEMES, defaultColor: false }) }
      : previous
  const result = await stream.tokenizer.enqueue(request.text.slice(stream.source.length))
  stream.source = request.text
  streams.set(request.key, stream)
  post({
    type: "highlight",
    id: request.id,
    key: request.key,
    reset,
    stable: result.stable.filter((item) => item.content.length > 0).map(token),
    unstable: result.unstable.filter((item) => item.content.length > 0).map(token),
  })
}

const jobs: Job[] = []
const pending = new Map<string, Extract<Job, { type: "highlight" }>>()
let draining: Promise<void> | undefined
let cursor = 0

const supersede = (request: HighlightRequest) => post({ type: "superseded", id: request.id, key: request.key })

const work = async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor++]
    if (job === undefined) continue
    if (job.type === "dispose") {
      streams.delete(job.key)
      continue
    }
    if (pending.get(job.key) === job) pending.delete(job.key)
    const request = job.request
    job.request = undefined
    if (request === undefined) continue
    await run(request).catch((error: unknown) =>
      post({ type: "error", id: request.id, key: request.key, message: error instanceof Error ? error.message : String(error) }),
    )
  }
}

const drain = () => {
  draining ??= Promise.resolve()
    .then(work)
    .finally(() => {
      jobs.splice(0, cursor)
      cursor = 0
      draining = undefined
      if (jobs.length > 0) drain()
    })
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  const queued = pending.get(request.key)
  if (request.type === "dispose") {
    if (queued?.request) supersede(queued.request)
    if (queued) {
      queued.request = undefined
      pending.delete(request.key)
    }
    jobs.push({ type: "dispose", key: request.key })
    drain()
    return
  }
  if (queued) {
    if (queued.request) supersede(queued.request)
    queued.request = request
    return
  }
  const job = { type: "highlight" as const, key: request.key, request }
  pending.set(request.key, job)
  jobs.push(job)
  drain()
}
