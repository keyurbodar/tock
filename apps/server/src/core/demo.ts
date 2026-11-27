import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type FauxResponseFactory,
  type Message,
  type MutableModels,
} from "@earendil-works/pi-ai"

export const DEMO_MODEL = "tock/demo"

const textOf = (message: Message | undefined): string => {
  if (!message || message.role !== "user") return ""
  if (typeof message.content === "string") return message.content
  return message.content.map((block) => (block.type === "text" ? block.text : "")).join(" ")
}

const REPLY = `Here's what I found, and the change is small.

The token refresh races the request that triggered it, so the old token gets read twice. I moved the read **after** the refresh resolves and added a test for the overlap.

\`\`\`ts
export async function withFreshToken<T>(run: (token: string) => Promise<T>) {
  const token = await refreshIfStale()
  return run(token)
}
\`\`\`

- 214 tests pass
- The branch is pushed as \`fix/login-loop\`

Want me to open the pull request?`

const LONG = `Here's the whole module.\n\n\`\`\`ts\n${Array.from({ length: 30 }, (_, i) => `export const step${i} = (input: string) => input.trim().toLowerCase().replace(/\\s+/g, "-").padEnd(${i + 40}, ".") // a deliberately long line so the block scrolls sideways`).join("\n")}\n\`\`\``

const FORMATS = `Every format, in one reply.

~~Struck out~~ and **bold** with a [dotted link](https://example.com).

> A quoted line
> that keeps going

---

3. three
4. four

- parent
  - nested child
- second

- [x] done task
- [ ] open task

| Name | Count |
| :--- | ---: |
| Apples | 3 |
| Pears | 12 |`

const STORY = [REPLY, REPLY.replace("Here's what I found, and the change is small.", "One more pass, on the retry path."), REPLY.replace("Here's what I found, and the change is small.", "And the last one, on logout.")].join("\n\n")

const PLAN = ["Check what I already know", "Test it in the sandbox", "Write up the answer"]

const scripted: FauxResponseFactory = (context) => {
  const lastUser = context.messages.findLastIndex((m) => m.role === "user")
  const asked = textOf(context.messages[lastUser]).trim()
  if (/fail once/i.test(asked) && context.messages.filter((m) => m.role === "user" && textOf(m).trim() === asked).length < 2)
    return fauxAssistantMessage([], { stopReason: "error", errorMessage: "The request was rejected (invalid_request_error)." })
  if (/fail once/i.test(asked)) return fauxAssistantMessage(fauxText("Back on track: this time the model answered."))
  const done = new Set(context.messages.slice(lastUser + 1).flatMap((m) => (m.role === "toolResult" ? [m.toolName] : [])))
  const answered = context.messages.slice(lastUser + 1).find((m) => m.role === "toolResult" && m.toolName === "ask_owner")
  const plans = context.messages.slice(lastUser + 1).filter((m) => m.role === "toolResult" && m.toolName === "update_plan").length
  if (/long job/i.test(asked)) {
    const ran = context.messages.slice(lastUser + 1).filter((m) => m.role === "toolResult").length
    if (ran >= 30) return fauxAssistantMessage(fauxText("The long job finished: 30 steps, nothing failed."))
    if (ran === 0)
      return fauxAssistantMessage([
        fauxThinking("A long job: I'll work through it in batches and dump the full log once so you can scroll it."),
        fauxToolCall("codemode", { code: "return Array.from({ length: 160 }, (_, i) => `line ${i + 1}: processed shard ${i}`).join(\"\\n\")" }),
        fauxToolCall("file_write", { name: "probe2.mjs", content: "export const probe = 2" }),
        fauxToolCall("memory_search", { query: "long job batch 1" }),
      ], { stopReason: "toolUse" })
    return fauxAssistantMessage([0, 1, 2].map((n) => fauxToolCall("memory_search", { query: `long job batch ${ran + n}` })), { stopReason: "toolUse" })
  }
  const reacted = context.messages.slice(lastUser + 1).some((m) => m.role === "toolResult" && m.toolName === "react")
  const cue = /^react with (\S+)/i.exec(asked)
  if (cue) {
    if (!reacted) return fauxAssistantMessage([fauxToolCall("react", { emoji: cue[1]! })], { stopReason: "toolUse" })
    return fauxAssistantMessage([])
  }
  const approval = /approve/i.test(asked)
  const question = /question|choose/i.test(asked)
  if (!done.size && /two questions/i.test(asked))
    return fauxAssistantMessage([
      fauxToolCall("ask_owner", {
        kind: "question",
        question: "A couple of choices before I start",
        questions: [
          { question: "Which branch should I base the fix on?", options: ["main", "release/2.4", "fix/login-loop"] },
          { question: "Should I open a pull request when it passes?", options: ["Yes, open it", "No, just push"] },
        ],
      }),
    ], { stopReason: "toolUse" })
  if (!done.size && (approval || question))
    return fauxAssistantMessage([
      fauxThinking(approval ? "This touches production, so I want the owner's go-ahead before I run anything." : "There are two reasonable ways to do this; the owner should pick."),
      fauxToolCall("update_plan", { steps: PLAN, current: 0 }),
      approval
        ? fauxToolCall("ask_owner", { kind: "approval", question: "Deploy the fix to production?", summary: "Ships fix/login-loop to the tock worker; takes about a minute and can be rolled back." })
        : fauxToolCall("ask_owner", { kind: "question", question: "Which branch should I base the fix on?", options: ["main", "release/2.4", "fix/login-loop"] }),
    ], { stopReason: "toolUse" })
  if (answered && /"answer":"Deny"/.test(JSON.stringify(answered.content)))
    return fauxAssistantMessage(fauxText("Understood, I won't deploy. The branch stays as it is, ready whenever you want to ship it."))
  if (!done.size) {
    if (asked.startsWith("Show a long code block")) return fauxAssistantMessage(fauxText(LONG))
    if (asked.startsWith("Show every markdown format")) return fauxAssistantMessage(fauxText(FORMATS))
    if (asked.startsWith("Stream a long answer")) return fauxAssistantMessage(fauxText(STORY))
    if (asked.startsWith("Send the files back")) {
      const files = asked.match(/\[[^\]\n]+\]\(tock-file:[\w-]+\)/g) ?? []
      return fauxAssistantMessage(fauxText(files.length ? `Here they are, cleaned up and ready.\n\n${files.join("\n")}\n\nShout if any of them needs another pass.` : "There were no files to send back."))
    }
    if (asked.length < 12) return fauxAssistantMessage(fauxText(`On it. Tell me a little more about ${asked ? `"${asked}"` : "what you need"} and I'll start.`))
    return fauxAssistantMessage([
      fauxThinking(`Reading the request: ${asked.slice(0, 120)}. I'll check what I already know first, then test the idea in the sandbox before I answer, so the reply rests on something I ran rather than a guess.`),
      fauxToolCall("update_plan", { steps: PLAN, current: 0 }),
      fauxToolCall("memory_search", { query: asked.slice(0, 80) }),
    ], { stopReason: "toolUse" })
  }
  if (!done.has("codemode"))
    return fauxAssistantMessage([
      fauxThinking("Memory came back with the earlier notes. Checking the timing in the sandbox before I change anything, the slowest run is the one that matters."),
      fauxToolCall("update_plan", { steps: PLAN, current: 1 }),
      fauxToolCall("codemode", { code: "const runs = [120, 140, 95, 210]\nreturn { slowest: Math.max(...runs), mean: runs.reduce((a, b) => a + b) / runs.length }" }),
    ], { stopReason: "toolUse" })
  if (plans < 3)
    return fauxAssistantMessage(
      [
        fauxToolCall("update_plan", { steps: PLAN, current: 2 }),
        fauxToolCall("suggest_followups", {
          suggestions: [
            { emoji: "🔀", label: "Open the pull request", prompt: "Open a pull request for fix/login-loop with a short summary of the race and the new test." },
            { emoji: "🧪", label: "Run the flaky suite", prompt: "Run the auth test suite 20 times in the sandbox and tell me if the overlap test ever fails." },
            { emoji: "📝", label: "Write release notes", prompt: "Draft a two-line release note for the login loop fix that a non-engineer understands." },
          ],
        }),
      ],
      { stopReason: "toolUse" },
    )
  return fauxAssistantMessage(fauxText(REPLY))
}

export function installDemoModel(models: MutableModels): void {
  const faux = fauxProvider({
    provider: "tock",
    models: [{ id: "demo", name: "Tock demo", reasoning: true, input: ["text", "image"], contextWindow: 200_000, maxTokens: 8_000 }],
    tokensPerSecond: 90,
    tokenSize: { min: 2, max: 5 },
  })
  const rearm: FauxResponseFactory = (...args) => {
    faux.appendResponses([rearm])
    return scripted(...args)
  }
  faux.setResponses([rearm])
  models.setProvider(faux.provider)
}
