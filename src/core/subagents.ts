import type { SettingsStore } from "./settings.js";

export interface SubagentSlot {
  readonly taskId: string;
  readonly conversationId: string;
  readonly startedAt: number;
}

export class SubagentPool {
  private readonly settings: SettingsStore;
  private readonly active = new Map<string, SubagentSlot>();
  private readonly waiters: Array<() => void> = [];

  constructor(settings: SettingsStore) {
    this.settings = settings;
  }

  get limit(): number {
    return this.settings.get().maxSubagents;
  }

  get runningCount(): number {
    return this.active.size;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  listActive(): SubagentSlot[] {
    return Array.from(this.active.values());
  }

  async acquire(taskId: string, conversationId: string, signal?: AbortSignal): Promise<void> {
    if (this.active.has(taskId)) return;
    while (this.active.size >= this.limit) {
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
    this.active.set(taskId, { taskId, conversationId, startedAt: Date.now() });
  }

  release(taskId: string): void {
    if (!this.active.delete(taskId)) return;
    while (this.active.size < this.limit && this.waiters.length > 0) {
      const next = this.waiters.shift();
      next?.();
    }
  }
}
