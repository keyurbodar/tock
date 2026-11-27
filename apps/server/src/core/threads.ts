const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isThreadId = (value: string): boolean => THREAD_ID.test(value);

/**
 * Public thread ids are client-minted UUIDs, so a new chat has its URL before
 * the server knows about it. pi keeps its own session ids; this is the only
 * place the two meet.
 */
export class ThreadIds {
  readonly #sql: SqlStorage;
  readonly #sessionOf = new Map<string, string>();
  readonly #threadOf = new Map<string, string>();

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    for (const row of sql.exec<{ id: string; session: string }>("SELECT id, session FROM tock_threads")) {
      this.#remember(row.id, row.session);
    }
  }

  session(threadId: string): string | undefined {
    return this.#sessionOf.get(threadId);
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
    this.#remember(threadId, session);
  }

  #remember(threadId: string, session: string): void {
    this.#sessionOf.set(threadId, session);
    this.#threadOf.set(session, threadId);
  }
}
