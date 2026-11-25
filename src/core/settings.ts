import type { OwnerSettings } from "../types.js";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeHHMM(value: string | null | undefined, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const trimmed = value.trim();
  if (!HHMM_RE.test(trimmed)) {
    throw new Error(`invalid_time_format:${trimmed}`);
  }
  return trimmed;
}

export class SettingsStore {
  private readonly sql: SqlStorage;
  private cache: OwnerSettings | null = null;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  get(): OwnerSettings {
    if (this.cache) return this.cache;
    const row = this.sql
      .exec(
        `SELECT dev_mode, max_subagents, model, background_model, fallback_model, timezone,
                proactive_heartbeat, quiet_hours_start, quiet_hours_end, morning_brief_time, updated_at
         FROM tock_settings WHERE id = 1`
      )
      .one();
    this.cache = {
      devMode: Number(row.dev_mode) === 1,
      maxSubagents: Math.max(1, Math.min(10, Number(row.max_subagents ?? 3))),
      model: row.model ? String(row.model) : null,
      backgroundModel: row.background_model ? String(row.background_model) : null,
      fallbackModel: row.fallback_model ? String(row.fallback_model) : null,
      timezone: String(row.timezone ?? "UTC"),
      proactiveHeartbeat: Number(row.proactive_heartbeat ?? 1) === 1,
      quietHoursStart: row.quiet_hours_start ? String(row.quiet_hours_start) : null,
      quietHoursEnd: row.quiet_hours_end ? String(row.quiet_hours_end) : null,
      morningBriefTime: row.morning_brief_time ? String(row.morning_brief_time) : null,
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
      backgroundModel:
        patch.backgroundModel !== undefined ? patch.backgroundModel : cur.backgroundModel,
      fallbackModel: patch.fallbackModel !== undefined ? patch.fallbackModel : cur.fallbackModel,
      timezone: patch.timezone ?? cur.timezone,
      proactiveHeartbeat: patch.proactiveHeartbeat ?? cur.proactiveHeartbeat,
      quietHoursStart: normalizeHHMM(patch.quietHoursStart, cur.quietHoursStart),
      quietHoursEnd: normalizeHHMM(patch.quietHoursEnd, cur.quietHoursEnd),
      morningBriefTime: normalizeHHMM(patch.morningBriefTime, cur.morningBriefTime),
      updatedAt: Date.now()
    };
    this.sql.exec(
      `UPDATE tock_settings
       SET dev_mode = ?, max_subagents = ?, model = ?, background_model = ?, fallback_model = ?,
           timezone = ?, proactive_heartbeat = ?, quiet_hours_start = ?, quiet_hours_end = ?,
           morning_brief_time = ?, updated_at = ?
       WHERE id = 1`,
      next.devMode ? 1 : 0,
      next.maxSubagents,
      next.model,
      next.backgroundModel,
      next.fallbackModel,
      next.timezone,
      next.proactiveHeartbeat ? 1 : 0,
      next.quietHoursStart,
      next.quietHoursEnd,
      next.morningBriefTime,
      next.updatedAt
    );
    this.cache = next;
    return next;
  }
}
