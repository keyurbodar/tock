export interface SessionSummary {
  title: string;
  preview: string;
  messageCount: number;
  updatedAt: number | null;
}

interface SummaryEntry {
  readonly model?: readonly SummaryMessage[];
}

interface SummaryMessage {
  readonly role: string;
  readonly content: unknown;
  readonly timestamp?: number;
}

const TITLE_MAX = 80;
const PREVIEW_MAX = 140;

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: unknown) =>
      block &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
        ? block.text
        : "",
    )
    .join(" ");
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function summarizeEntries(entries: readonly SummaryEntry[]): SessionSummary {
  let title = "";
  let preview = "";
  let messageCount = 0;
  let updatedAt: number | null = null;
  for (const entry of entries) {
    for (const message of entry.model ?? []) {
      if (message.role !== "user" && message.role !== "assistant") continue;
      const text = messageText(message.content);
      if (!text.trim()) continue;
      messageCount++;
      if (message.role === "user" && !title) title = clip(text, TITLE_MAX);
      preview = clip(text, PREVIEW_MAX);
      if (typeof message.timestamp === "number") updatedAt = message.timestamp;
    }
  }
  return { title, preview, messageCount, updatedAt };
}
