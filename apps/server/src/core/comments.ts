import type { Comment, CommentsByRef, ReactionActor } from "@tock/protocol";

type Row = { id: string; ref: string; body: string; actor: string; at: number };

const toComment = (row: Row): Comment => ({ id: row.id, ref: row.ref, text: row.body, by: row.actor as ReactionActor, at: row.at });

/** Comments on message units, keyed by chat and ref like reactions; a resubscribe reads them straight from here. */
export class Comments {
  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = () => Date.now(),
  ) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS tock_comments (
        id TEXT PRIMARY KEY,
        session TEXT NOT NULL,
        ref TEXT NOT NULL,
        body TEXT NOT NULL,
        actor TEXT NOT NULL,
        at INTEGER NOT NULL
      )`,
    );
    sql.exec("CREATE INDEX IF NOT EXISTS tock_comments_session ON tock_comments (session, at)");
  }

  add(session: string, ref: string, text: string, by: ReactionActor): Comment {
    const comment: Comment = { id: crypto.randomUUID(), ref, text, by, at: this.now() };
    this.sql.exec("INSERT INTO tock_comments (id, session, ref, body, actor, at) VALUES (?, ?, ?, ?, ?, ?)", comment.id, session, ref, text, by, comment.at);
    return comment;
  }

  /** Deletes one comment of this chat; null when there was none. */
  delete(session: string, id: string): Comment | null {
    const row = this.sql.exec<Row>("DELETE FROM tock_comments WHERE session = ? AND id = ? RETURNING id, ref, body, actor, at", session, id).toArray()[0];
    return row ? toComment(row) : null;
  }

  list(session: string): CommentsByRef {
    const out: Record<string, Comment[]> = {};
    for (const row of this.sql.exec<Row>("SELECT id, ref, body, actor, at FROM tock_comments WHERE session = ? ORDER BY at, rowid", session)) (out[row.ref] ??= []).push(toComment(row));
    return out;
  }
}
