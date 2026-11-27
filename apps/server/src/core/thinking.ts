type Block = { readonly type: string }
type Streaming = { readonly timestamp?: number; readonly content?: readonly Block[] } | undefined

export interface ThinkingSpan {
  readonly key: string
  readonly ms: number
}

/**
 * Real reasoning times, the way t3code keeps them: a thinking block starts when it first streams in and ends when a
 * later block starts or the message stops streaming. Spans are keyed by the assistant message's timestamp and the
 * block's index, so the client can match them to the stored message. Writes once per start and once per end.
 */
export class ThinkingSpans {
  private readonly open = new Map<string, Set<string>>()

  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = () => Date.now(),
  ) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS tock_thinking (
        session TEXT NOT NULL,
        msg INTEGER NOT NULL,
        block INTEGER NOT NULL,
        started INTEGER NOT NULL,
        ended INTEGER,
        PRIMARY KEY (session, msg, block)
      )`,
    )
  }

  /** Feed the generation's streaming message (or undefined once it settles). Returns the spans that just ended. */
  observe(session: string, message: Streaming): ThinkingSpan[] {
    const at = this.now()
    const live = this.open.get(session) ?? new Set<string>()
    this.open.set(session, live)
    const stamp = typeof message?.timestamp === "number" ? message.timestamp : undefined
    const blocks = stamp === undefined ? [] : (message?.content ?? [])
    const ended: ThinkingSpan[] = []
    for (const key of [...live]) {
      const [msg, block] = key.split(":").map(Number) as [number, number]
      if (msg === stamp && blocks.length <= block + 1) continue
      live.delete(key)
      const row = this.sql
        .exec<{ started: number }>("UPDATE tock_thinking SET ended = ? WHERE session = ? AND msg = ? AND block = ? AND ended IS NULL RETURNING started", at, session, msg, block)
        .toArray()[0]
      if (row) ended.push({ key, ms: at - row.started })
    }
    blocks.forEach((block, index) => {
      if (block.type !== "thinking" || stamp === undefined) return
      const key = `${stamp}:${index}`
      if (live.has(key) || index + 1 < blocks.length) return
      const fresh = this.sql
        .exec("INSERT OR IGNORE INTO tock_thinking (session, msg, block, started) VALUES (?, ?, ?, ?) RETURNING started", session, stamp, index, at)
        .toArray().length
      if (fresh) live.add(key)
    })
    return ended
  }

  /** Every finished span of a session: `"<message timestamp>:<block>" -> ms`. */
  list(session: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const row of this.sql.exec<{ msg: number; block: number; started: number; ended: number }>("SELECT msg, block, started, ended FROM tock_thinking WHERE session = ? AND ended IS NOT NULL", session))
      out[`${row.msg}:${row.block}`] = row.ended - row.started
    return out
  }
}
