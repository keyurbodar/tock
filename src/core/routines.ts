import type { OwnerSettings, RoutineRecord } from "../types.js";

export const HEARTBEAT_ROUTINE_ID = "builtin:heartbeat";
export const MORNING_BRIEF_ROUTINE_ID = "builtin:morning_brief";

export type RoutineInput = Omit<
  RoutineRecord,
  "id" | "lastHash" | "schedulerJobId" | "lastRunAt" | "updatedAt"
> & { id?: string };

export interface RoutineSchedulerLike {
  set(
    when: Date | string | number,
    callback: "runRoutine",
    payload: { routineId: string },
  ): Promise<{ id: string }>;
  every(
    intervalSeconds: number,
    callback: "runRoutine",
    payload: { routineId: string },
  ): Promise<{ id: string }>;
  cancel(id: string): Promise<boolean>;
}

export function hhmmToUtcCron(hhmm: string, timezone: string, refDate = new Date()): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return "0 8 * * *";
  const targetH = Number(m[1]);
  const targetM = Number(m[2]);
  let offsetMinutes = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(refDate);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    const refUtc = Date.UTC(
      refDate.getUTCFullYear(),
      refDate.getUTCMonth(),
      refDate.getUTCDate(),
      refDate.getUTCHours(),
      refDate.getUTCMinutes()
    );
    offsetMinutes = Math.round((localAsUtc - refUtc) / 60_000);
  } catch {
    offsetMinutes = 0;
  }
  const totalUtcMinutes = ((targetH * 60 + targetM - offsetMinutes) % 1440 + 1440) % 1440;
  const utcH = Math.floor(totalUtcMinutes / 60);
  const utcM = totalUtcMinutes % 60;
  return `${utcM} ${utcH} * * *`;
}

export class RoutineStore {
  private readonly sql: SqlStorage;
  private readonly scheduler: RoutineSchedulerLike;

  constructor(sql: SqlStorage, scheduler: RoutineSchedulerLike) {
    this.sql = sql;
    this.scheduler = scheduler;
  }

  list(): RoutineRecord[] {
    const rows = this.sql
      .exec(
        `SELECT id, name, schedule, schedule_type, prompt, check_script, quiet_if_unchanged, last_hash, enabled, scheduler_job_id, last_run_at, updated_at
         FROM tock_routines ORDER BY name ASC`,
      )
      .toArray();
    return rows.map((r) => this.mapRow(r));
  }

  get(id: string): RoutineRecord | undefined {
    const rows = this.sql
      .exec(
        `SELECT id, name, schedule, schedule_type, prompt, check_script, quiet_if_unchanged, last_hash, enabled, scheduler_job_id, last_run_at, updated_at
         FROM tock_routines WHERE id = ?`,
        id,
      )
      .toArray();
    return rows[0] ? this.mapRow(rows[0]) : undefined;
  }

  async upsert(input: RoutineInput): Promise<RoutineRecord> {
    const id = input.id || crypto.randomUUID();
    const existing = this.get(id);

    let schedulerJobId: string | null = null;
    if (input.enabled) {
      if (input.scheduleType === "interval") {
        const secs = Math.max(10, Number(input.schedule));
        const job = await this.scheduler.every(secs, "runRoutine", { routineId: id });
        schedulerJobId = job.id;
      } else if (input.scheduleType === "delayed") {
        const secs = Math.max(1, Number(input.schedule));
        const job = await this.scheduler.set(secs, "runRoutine", { routineId: id });
        schedulerJobId = job.id;
      } else {
        const job = await this.scheduler.set(input.schedule, "runRoutine", { routineId: id });
        schedulerJobId = job.id;
      }
    }

    if (existing?.schedulerJobId && existing.schedulerJobId !== schedulerJobId) {
      await this.scheduler.cancel(existing.schedulerJobId);
    }

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_routines (id, name, schedule, schedule_type, prompt, check_script, quiet_if_unchanged, last_hash, enabled, scheduler_job_id, last_run_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         schedule = excluded.schedule,
         schedule_type = excluded.schedule_type,
         prompt = excluded.prompt,
         check_script = excluded.check_script,
         quiet_if_unchanged = excluded.quiet_if_unchanged,
         enabled = excluded.enabled,
         scheduler_job_id = excluded.scheduler_job_id,
         updated_at = excluded.updated_at`,
      id,
      input.name,
      input.schedule,
      input.scheduleType,
      input.prompt,
      input.checkScript ?? null,
      input.quietIfUnchanged ? 1 : 0,
      existing?.lastHash ?? null,
      input.enabled ? 1 : 0,
      schedulerJobId,
      existing?.lastRunAt ?? null,
      now,
    );

    return this.get(id)!;
  }

  async syncBuiltins(settings: OwnerSettings): Promise<{ heartbeat: RoutineRecord; morningBrief: RoutineRecord }> {
    const sync = async (input: RoutineInput): Promise<RoutineRecord> => {
      const current = input.id ? this.get(input.id) : undefined;
      if (current && current.name === input.name && current.schedule === input.schedule &&
          current.scheduleType === input.scheduleType && current.prompt === input.prompt &&
          current.checkScript === input.checkScript && current.quietIfUnchanged === input.quietIfUnchanged &&
          current.enabled === input.enabled && (!input.enabled || current.schedulerJobId)) return current;
      return this.upsert(input);
    };
    const heartbeat = await sync({
      id: HEARTBEAT_ROUTINE_ID,
      name: "Ambient Heartbeat",
      schedule: "0 * * * *",
      scheduleType: "cron",
      prompt:
        "Run an ambient proactive check: inspect open items, long-term memory commitments, and any connected MCP/API tools for urgent deadlines, blockers, or high-priority updates. If nothing requires the owner's attention right now, stay silent and do not call notify_owner. Only call notify_owner with an appropriate urgency (low, normal, or urgent) when something genuinely matters.",
      checkScript: null,
      quietIfUnchanged: false,
      enabled: settings.proactiveHeartbeat
    });

    const briefCron = hhmmToUtcCron(settings.morningBriefTime ?? "08:00", settings.timezone);
    const morningBrief = await sync({
      id: MORNING_BRIEF_ROUTINE_ID,
      name: "Morning Brief",
      schedule: briefCron,
      scheduleType: "cron",
      prompt:
        "Compile a concise morning brief for the owner: include any overnight queued notifications provided in the trigger, review open items and upcoming deadlines, check connected MCP/API workspace tools if available, and send one clean summary via notify_owner with urgency 'normal'.",
      checkScript: null,
      quietIfUnchanged: false,
      enabled: settings.proactiveHeartbeat && Boolean(settings.morningBriefTime)
    });

    return { heartbeat, morningBrief };
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.get(id);
    if (!existing) return false;
    if (existing.schedulerJobId) {
      await this.scheduler.cancel(existing.schedulerJobId);
    }
    this.sql.exec(`DELETE FROM tock_routines WHERE id = ?`, id);
    return true;
  }

  markRun(id: string, outputHash: string): { changed: boolean; isFirstRun: boolean } {
    const existing = this.get(id);
    const isFirstRun = existing?.lastHash === null || existing?.lastHash === undefined;
    const changed = existing?.lastHash !== outputHash;
    if (changed) {
      this.sql.exec(
        `UPDATE tock_routines SET last_hash = ?, last_run_at = ? WHERE id = ?`,
        outputHash,
        Date.now(),
        id,
      );
    }
    return { changed, isFirstRun };
  }

  private mapRow(r: Record<string, SqlStorageValue>): RoutineRecord {
    return {
      id: String(r.id),
      name: String(r.name),
      schedule: String(r.schedule),
      scheduleType: (String(r.schedule_type) as RoutineRecord["scheduleType"]) || "cron",
      prompt: String(r.prompt),
      checkScript: r.check_script ? String(r.check_script) : null,
      quietIfUnchanged: Number(r.quiet_if_unchanged) === 1,
      lastHash: r.last_hash ? String(r.last_hash) : null,
      enabled: Number(r.enabled) === 1,
      schedulerJobId: r.scheduler_job_id ? String(r.scheduler_job_id) : null,
      lastRunAt:
        r.last_run_at !== null && r.last_run_at !== undefined ? Number(r.last_run_at) : null,
      updatedAt: Number(r.updated_at),
    };
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
