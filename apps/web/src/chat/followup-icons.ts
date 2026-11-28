import type { Followup } from "@tock/protocol"

// The agent picks an emoji per suggestion; follow-ups draw it as the closest glass Tock icon (vendored in
// packages/ui/scripts/tock-vendor.ts). Unknown emoji fall back to a keyword in the label, then to a sparkle.
const byEmoji: Record<string, string> = {
  "🔀": "git-pull-request", "🧪": "flask", "📝": "note-pencil", "✍️": "pencil-simple", "🌦️": "cloud-rain", "🌧️": "cloud-rain",
  "☔": "cloud-rain", "🗓️": "calendar-blank", "📅": "calendar-blank", "📆": "calendar-blank", "🔍": "magnifying-glass", "🔎": "magnifying-glass",
  "🐛": "bug", "🚀": "rocket-launch", "💡": "lightbulb", "💬": "chat-circle", "✅": "check-circle", "☑️": "list-checks", "📋": "list-checks",
  "📄": "file-text", "📃": "file-text", "🖼️": "image", "📸": "image", "⚡": "lightning", "🔁": "arrow-clockwise", "🔄": "arrow-clockwise",
  "▶️": "play", "🗺️": "map-trifold", "🧳": "suitcase-rolling", "📊": "chart-bar", "📈": "chart-bar", "✉️": "envelope-simple", "📧": "envelope-simple",
  "🔒": "lock-simple", "🔐": "lock-simple", "🗑️": "trash", "🔧": "wrench", "🛠️": "wrench", "❓": "question", "📚": "book-open", "📖": "book-open",
  "💻": "terminal-window", "🖥️": "terminal-window", "🛒": "shopping-cart", "❤️": "heart", "⭐": "star", "🌟": "star", "⏰": "clock", "⏱️": "clock",
  "👥": "users", "🤝": "users", "✨": "sparkle",
}
const byWord: [RegExp, string][] = [
  [/pull request|\bpr\b|merge|branch/i, "git-pull-request"], [/test|suite/i, "flask"], [/note|draft|write/i, "note-pencil"],
  [/forecast|weather|rain/i, "cloud-rain"], [/calendar|schedule|week|day/i, "calendar-blank"], [/search|find|look/i, "magnifying-glass"],
  [/bug|fix|debug/i, "bug"], [/deploy|ship|launch/i, "rocket-launch"], [/idea|explain/i, "lightbulb"], [/plan|list|todo/i, "list-checks"],
]

export const followupIcon = (f: Followup) => byEmoji[f.emoji] ?? byEmoji[f.emoji.replace(/\uFE0F/g, "")] ?? byWord.find(([re]) => re.test(f.label))?.[1] ?? "sparkle"
