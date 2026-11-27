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

const scripted: FauxResponseFactory = (context) => {
  const last = context.messages.at(-1)
  if (last?.role === "toolResult") {
    const usedCode = context.messages.some((m) => m.role === "toolResult" && m.toolName === "codemode")
    if (!usedCode) {
      return fauxAssistantMessage([
        fauxThinking("Memory came back. Checking the timing in the sandbox before I change anything."),
        fauxToolCall("codemode", { code: "const runs = [120, 140, 95, 210]\nreturn { slowest: Math.max(...runs), mean: runs.reduce((a, b) => a + b) / runs.length }" }),
      ], { stopReason: "toolUse" })
    }
    return fauxAssistantMessage(fauxText(REPLY))
  }
  const asked = textOf(last).trim()
  if (asked.length < 12) return fauxAssistantMessage(fauxText(`On it. Tell me a little more about ${asked ? `"${asked}"` : "what you need"} and I'll start.`))
  return fauxAssistantMessage([
    fauxThinking(`Reading the request: ${asked.slice(0, 120)}. Starting with what I already know.`),
    fauxToolCall("memory_search", { query: asked.slice(0, 80) }),
  ], { stopReason: "toolUse" })
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
