import type { OwnerSettings } from "../types.js";

export class SettingsStore {
  private readonly sql: SqlStorage;
  private cache: OwnerSettings | null = null;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  get(): OwnerSettings {
    if (this.cache) return this.cache;
    const row = this.sql
      .exec(`SELECT dev_mode, max_subagents, model, background_model, fallback_model, timezone, updated_at FROM tock_settings WHERE id = 1`)
      .one();
    this.cache = {
      devMode: Number(row.dev_mode) === 1,
      maxSubagents: Math.max(1, Math.min(10, Number(row.max_subagents ?? 3))),
      model: row.model ? String(row.model) : null,
      backgroundModel: row.background_model ? String(row.background_model) : null,
      fallbackModel: row.fallback_model ? String(row.fallback_model) : null,
      timezone: String(row.timezone ?? "UTC"),
      updatedAt: Number(row.updated_at)
    };
    return this.cache;
  }

  update(patch: Partial<Omit<OwnerSettings, "updatedAt">>): OwnerSettings {
    const cur = this.get();
    const next: OwnerSettings = {
      devMode: patch.devMode ?? cur.devMode,
      maxSubagents: Math.max(1, Math.min(10, Math.floor(patch.maxSubagents ?? cur.maxSubagents))),
      model: patch.model !== undefined ? patch.model : cur.model,
      backgroundModel: patch.backgroundModel !== undefined ? patch.backgroundModel : cur.backgroundModel,
      fallbackModel: patch.fallbackModel !== undefined ? patch.fallbackModel : cur.fallbackModel,
      timezone: patch.timezone ?? cur.timezone,
      updatedAt: Date.now()
    };
    this.sql.exec(
      `UPDATE tock_settings
       SET dev_mode = ?, max_subagents = ?, model = ?, background_model = ?, fallback_model = ?, timezone = ?, updated_at = ?
       WHERE id = 1`,
      next.devMode ? 1 : 0,
      next.maxSubagents,
      next.model,
      next.backgroundModel,
      next.fallbackModel,
      next.timezone,
      next.updatedAt
    );
    this.cache = next;
    return next;
  }
}
