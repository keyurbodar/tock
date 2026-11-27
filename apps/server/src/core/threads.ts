import type { ThreadMeta } from "@tock/protocol";

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isThreadId = (value: string): boolean => THREAD_ID.test(value);

export type ThreadPatch = Partial<ThreadMeta>;

type Row = {
  id: string;
  session: string;
  title: string | null;
  pinned: number;
  archived: number;
  unread: number;
  deleted: number;
};

const toMeta = (row: Row): ThreadMeta => ({
  title: row.title,
  pinned: row.pinned === 1,
  archived: row.archived === 1,
  unread: row.unread === 1,
});

/**
 * Public thread ids are client-minted UUIDs, so a new chat has its URL before
 * the server knows about it. pi keeps its own session ids; this is the only
 * place the two meet, and where per-thread metadata lives.
 */
export class ThreadIds {
  readonly #sql: SqlStorage;
  readonly #rows = new Map<string, Row>();
  readonly #threadOf = new Map<string, string>();

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    for (const row of sql.exec<Row>("SELECT id, session, title, pinned, archived, unread, deleted FROM tock_threads")) {
      this.#remember({ ...row });
    }
  }

  session(threadId: string): string | undefined {
    return this.#rows.get(threadId)?.session;
  }

  thread(session: string): string {
    const known = this.#threadOf.get(session);
    if (known) return known;
    const id = crypto.randomUUID();
    this.bind(id, session);
    return id;
  }

  bind(threadId: string, session: string): void {
    this.#sql.exec(
      "INSERT INTO tock_threads (id, session, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
      threadId,
      session,
      Date.now(),
    );
    if (!this.#rows.has(threadId)) {
      this.#remember({ id: threadId, session, title: null, pinned: 0, archived: 0, unread: 0, deleted: 0 });
    }
  }

  meta(threadId: string): ThreadMeta | undefined {
    const row = this.#rows.get(threadId);
    return row && !row.deleted ? toMeta(row) : undefined;
  }

  update(threadId: string, patch: ThreadPatch): ThreadMeta {
    const row = this.#rows.get(threadId);
    if (!row || row.deleted) throw new Error("unknown_thread");
    const next: Row = {
      ...row,
      title: patch.title === undefined ? row.title : patch.title?.trim() || null,
      pinned: patch.pinned === undefined ? row.pinned : Number(patch.pinned),
      archived: patch.archived === undefined ? row.archived : Number(patch.archived),
      unread: patch.unread === undefined ? row.unread : Number(patch.unread),
    };
    this.#sql.exec(
      "UPDATE tock_threads SET title = ?, pinned = ?, archived = ?, unread = ? WHERE id = ?",
      next.title,
      next.pinned,
      next.archived,
      next.unread,
      threadId,
    );
    this.#remember(next);
    return toMeta(next);
  }

  remove(threadId: string): boolean {
    const row = this.#rows.get(threadId);
    if (!row || row.deleted) return false;
    this.#sql.exec("UPDATE tock_threads SET deleted = 1 WHERE id = ?", threadId);
    this.#remember({ ...row, deleted: 1 });
    return true;
  }

  #remember(row: Row): void {
    this.#rows.set(row.id, row);
    this.#threadOf.set(row.session, row.id);
  }
}
