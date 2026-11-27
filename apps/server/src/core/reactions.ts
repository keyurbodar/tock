import type { Reaction, ReactionActor, ReactionPreview, ReactionsByRef } from "@tock/protocol";
import { plainMarkdown } from "./plain.js";

type Row = { ref: string; emoji: string; actor: string; at: number };

interface RefEntry {
  readonly id: { toString(): string } | string;
  readonly model?: readonly { readonly role: string; readonly content: unknown }[];
}

const EXCERPT_MAX = 40;

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((block: { type?: string; text?: unknown } | undefined) => (block?.type === "text" && typeof block.text === "string" ? block.text : "")).join(" ")
      : "";

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : flat;
};

/** The words a message ref points at: a user message ("entry:index") or one agent text block ("entry:index:block"). */
export function excerptOf(entries: readonly RefEntry[], ref: string): string {
  const [entryId, index, block] = ref.split(":");
  const message = entries.find((entry) => String(entry.id) === entryId)?.model?.[Number(index)];
  if (!message) return "";
  const content = block === undefined ? message.content : Array.isArray(message.content) ? [message.content[Number(block)]] : message.content;
  return clip(plainMarkdown(textOf(content)));
}

/** The newest user message's ref, the default target when the agent reacts. */
export function latestUserRef(entries: readonly RefEntry[]): string | undefined {
  for (let e = entries.length - 1; e >= 0; e--) {
    const model = entries[e]!.model ?? [];
    for (let m = model.length - 1; m >= 0; m--) if (model[m]!.role === "user") return `${String(entries[e]!.id)}:${m}`;
  }
  return undefined;
}

/**
 * Emoji reactions, keyed by chat (pi session), message ref, emoji and actor. One write per toggle; nothing else
 * stores them, so a resubscribe reads them straight from here.
 */
export class Reactions {
  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = () => Date.now(),
  ) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS tock_reactions (
        session TEXT NOT NULL,
        ref TEXT NOT NULL,
        emoji TEXT NOT NULL,
        actor TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (session, ref, emoji, actor)
      )`,
    );
  }

  /** Adds or removes one reaction. A repeat is a no-op and reports changed: false. */
  set(session: string, ref: string, emoji: string, by: ReactionActor, on: boolean): { changed: boolean; reaction: Reaction } {
    const at = this.now();
    const changed = on
      ? this.sql.exec("INSERT OR IGNORE INTO tock_reactions (session, ref, emoji, actor, at) VALUES (?, ?, ?, ?, ?) RETURNING at", session, ref, emoji, by, at).toArray().length > 0
      : this.sql.exec("DELETE FROM tock_reactions WHERE session = ? AND ref = ? AND emoji = ? AND actor = ? RETURNING at", session, ref, emoji, by).toArray().length > 0;
    return { changed, reaction: { ref, emoji, by, at } };
  }

  list(session: string): ReactionsByRef {
    const out: Record<string, Reaction[]> = {};
    for (const row of this.sql.exec<Row>("SELECT ref, emoji, actor, at FROM tock_reactions WHERE session = ? ORDER BY at, rowid", session))
      (out[row.ref] ??= []).push({ ref: row.ref, emoji: row.emoji, by: row.actor as ReactionActor, at: row.at });
    return out;
  }

  /** The newest reaction with an excerpt of the message it landed on, or null when the chat has none. */
  preview(session: string, entries: readonly RefEntry[]): ReactionPreview | null {
    const row = this.sql.exec<Row>("SELECT ref, emoji, actor, at FROM tock_reactions WHERE session = ? ORDER BY at DESC, rowid DESC LIMIT 1", session).toArray()[0];
    if (!row) return null;
    return { by: row.actor as ReactionActor, emoji: row.emoji, excerpt: excerptOf(entries, row.ref), at: row.at };
  }
}
