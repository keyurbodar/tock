import type { SettingsStore } from "./settings.js";

const STALE_SLOT_MS = 15 * 60_000;

export interface SubagentSlot {
  readonly taskId: string;
  readonly conversationId: string;
  readonly startedAt: number;
}

export class SubagentPool {
  private readonly sql: SqlStorage;
  private readonly settings: SettingsStore;
  private readonly waiters: Array<() => void> = [];

  constructor(sql: SqlStorage, settings: SettingsStore) {
    this.sql = sql;
    this.settings = settings;
  }

  get limit(): number {
    return this.settings.get().maxSubagents;
  }

  private pruneStale(): void {
    const cutoff = Date.now() - STALE_SLOT_MS;
    this.sql.exec(`DELETE FROM tock_subagents WHERE started_at < ?`, cutoff);
  }

  get runningCount(): number {
    this.pruneStale();
    const row = this.sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM tock_subagents`).one();
    return Number(row.c ?? 0);
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  listActive(): SubagentSlot[] {
    this.pruneStale();
    return this.sql
      .exec(
        `SELECT task_id, conversation_id, started_at FROM tock_subagents ORDER BY started_at ASC`,
      )
      .toArray()
      .map((r) => ({
        taskId: String(r.task_id),
        conversationId: String(r.conversation_id),
        startedAt: Number(r.started_at),
      }));
  }

  async acquire(taskId: string, conversationId: string, signal?: AbortSignal): Promise<void> {
    this.pruneStale();
    const existing = this.sql
      .exec(`SELECT task_id FROM tock_subagents WHERE task_id = ?`, taskId)
      .toArray();
    if (existing.length > 0) return;

    while (this.runningCount >= this.limit) {
      if (signal?.aborted) {
        throw new Error("subagent_acquire_aborted");
      }
      await new Promise<void>((resolve, reject) => {
        const onRelease = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          const idx = this.waiters.indexOf(onRelease);
          if (idx >= 0) this.waiters.splice(idx, 1);
          reject(new Error("subagent_acquire_aborted"));
        };
        this.waiters.push(onRelease);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }

    this.sql.exec(
      `INSERT OR REPLACE INTO tock_subagents (task_id, conversation_id, started_at) VALUES (?, ?, ?)`,
      taskId,
      conversationId,
      Date.now(),
    );
  }

  release(taskId: string): void {
    const existing = this.sql
      .exec(`SELECT task_id FROM tock_subagents WHERE task_id = ?`, taskId)
      .toArray();
    if (existing.length === 0) return;
    this.sql.exec(`DELETE FROM tock_subagents WHERE task_id = ?`, taskId);
    while (this.runningCount < this.limit && this.waiters.length > 0) {
      const next = this.waiters.shift();
      next?.();
    }
  }
}
