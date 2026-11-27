import { createStore, snapshot } from "solid-js"
import { idb } from "../lib/idb"

export type Tone = "needs" | "done" | "failed"

export interface Note {
  readonly id: string
  /** The chat it is about; notes about the same chat stack into one card. */
  readonly chat: string | undefined
  readonly tone: Tone
  readonly title: string
  readonly body: string
  readonly at: number
  readonly read: boolean
}

export const [notes, setNotes] = createStore<{ list: Note[]; loaded: boolean }>({ list: [], loaded: false })

const save = () => void idb.put("sessions", "notes", snapshot(notes.list))

export async function loadNotes() {
  const saved = await idb.get<Note[]>("sessions", "notes")
  setNotes((s) => {
    if (saved?.length) s.list = [...saved, ...s.list.filter((note) => !saved.some((old) => old.id === note.id))]
    s.loaded = true
  })
}

export function addNote(note: Omit<Note, "id" | "at" | "read">) {
  setNotes((s) => void s.list.unshift({ ...note, id: crypto.randomUUID(), at: Date.now(), read: false }))
  save()
}

/** A chat waiting on you keeps exactly one Needs you note, replaced when the question changes and gone once answered. */
export function needsNote(chat: string, title: string, question: string | null | undefined) {
  const current = notes.list.find((note) => note.chat === chat && note.tone === "needs")
  if (question && current?.body === question) return
  if (!question && !current) return
  setNotes((s) => {
    s.list = s.list.filter((note) => !(note.chat === chat && note.tone === "needs"))
    if (question) s.list.unshift({ id: crypto.randomUUID(), chat, tone: "needs", title, body: question, at: Date.now(), read: false })
  })
  save()
}

export function markAllRead() {
  setNotes((s) => s.list.forEach((note) => ((note as { read: boolean }).read = true)))
  save()
}

export function readChat(chat: string) {
  if (!notes.list.some((note) => note.chat === chat && !note.read)) return
  setNotes((s) => s.list.forEach((note) => note.chat === chat && ((note as { read: boolean }).read = true)))
  save()
}

export const unreadNotes = () => notes.list.filter((note) => !note.read).length

export interface Group {
  readonly key: string
  readonly tone: Tone
  readonly notes: readonly Note[]
}

/** Newest first, one card per chat; a chat waiting on you is filed under "Needs you" even if older notes say done. */
export function groups(): { needs: Group[]; today: Group[] } {
  const byKey = new Map<string, Note[]>()
  for (const note of notes.list) {
    const key = note.chat ?? note.id
    byKey.set(key, [...(byKey.get(key) ?? []), note])
  }
  const all = [...byKey].map(([key, list]): Group => ({ key, tone: list[0]!.tone, notes: list }))
  return { needs: all.filter((group) => group.tone === "needs"), today: all.filter((group) => group.tone !== "needs") }
}
