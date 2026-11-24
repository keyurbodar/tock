import { contentText, type Api, type Model, type Models } from "@earendil-works/pi-ai";
import type { MemoryItem, OpenItem } from "../types.js";

export interface MemoryBatchInput {
  coreContent?: string;
  addItems?: Array<{
    kind: MemoryItem["kind"];
    content: string;
    sourceSessionId?: string | null;
    supersedesId?: string;
  }>;
  upsertOpenItems?: Array<{
    id?: string;
    title: string;
    context?: string;
    sessionId?: string | null;
    status?: OpenItem["status"];
    dueAt?: number | null;
  }>;
}

function sanitizeFtsQuery(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

export class UnifiedMemory {
  private readonly storage: DurableObjectStorage;
  private readonly sql: SqlStorage;
  private coreCache: { content: string; version: number; updatedAt: number } | null = null;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.sql = storage.sql;
  }

  getCore(): { content: string; version: number; updatedAt: number } {
    if (this.coreCache) return this.coreCache;
    const row = this.sql
      .exec(`SELECT content, version, updated_at FROM tock_memory_core WHERE id = 1`)
      .one();
    this.coreCache = {
      content: String(row.content ?? ""),
      version: Number(row.version ?? 1),
      updatedAt: Number(row.updated_at ?? 0),
    };
    return this.coreCache;
  }

  listOpenItems(status: OpenItem["status"] = "open"): OpenItem[] {
    const rows = this.sql
      .exec(
        `SELECT id, title, context, session_id, status, due_at, updated_at
         FROM tock_open_items WHERE status = ? ORDER BY updated_at DESC LIMIT 20`,
        status,
      )
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      context: String(r.context ?? ""),
      sessionId: r.session_id ? String(r.session_id) : null,
      status: r.status === "resolved" ? "resolved" : "open",
      dueAt: r.due_at !== null && r.due_at !== undefined ? Number(r.due_at) : null,
      updatedAt: Number(r.updated_at),
    }));
  }

  search(query: string, limit = 6): MemoryItem[] {
    const fts = sanitizeFtsQuery(query);
    if (!fts) return this.recent(limit);
    const rows = this.sql
      .exec(
        `SELECT m.id, m.kind, m.content, m.source_session_id, m.superseded_by, m.created_at
         FROM tock_memory_fts f
         JOIN tock_memory_items m ON m.id = f.id
         WHERE tock_memory_fts MATCH ? AND m.superseded_by IS NULL
         ORDER BY bm25(tock_memory_fts) ASC, m.created_at DESC
         LIMIT ?`,
        fts,
        limit,
      )
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      kind: (String(r.kind) as MemoryItem["kind"]) || "fact",
      content: String(r.content),
      sourceSessionId: r.source_session_id ? String(r.source_session_id) : null,
      supersededBy: r.superseded_by ? String(r.superseded_by) : null,
      createdAt: Number(r.created_at),
    }));
  }

  recent(limit = 6): MemoryItem[] {
    const rows = this.sql
      .exec(
        `SELECT id, kind, content, source_session_id, superseded_by, created_at
         FROM tock_memory_items
         WHERE superseded_by IS NULL
         ORDER BY created_at DESC LIMIT ?`,
        limit,
      )
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      kind: (String(r.kind) as MemoryItem["kind"]) || "fact",
      content: String(r.content),
      sourceSessionId: r.source_session_id ? String(r.source_session_id) : null,
      supersededBy: r.superseded_by ? String(r.superseded_by) : null,
      createdAt: Number(r.created_at),
    }));
  }

  applyBatch(batch: MemoryBatchInput): { addedIds: string[]; openIds: string[] } {
    const now = Date.now();
    const addedIds: string[] = [];
    const openIds: string[] = [];

    this.storage.transactionSync(() => {
      if (batch.coreContent !== undefined) {
        const cur = this.getCore();
        const nextVersion = cur.version + 1;
        this.sql.exec(
          `UPDATE tock_memory_core SET content = ?, version = ?, updated_at = ? WHERE id = 1`,
          batch.coreContent,
          nextVersion,
          now,
        );
        this.coreCache = { content: batch.coreContent, version: nextVersion, updatedAt: now };
      }

      for (const item of batch.addItems ?? []) {
        const id = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO tock_memory_items (id, kind, content, source_session_id, superseded_by, created_at)
           VALUES (?, ?, ?, ?, NULL, ?)`,
          id,
          item.kind,
          item.content,
          item.sourceSessionId ?? null,
          now,
        );
        this.sql.exec(`INSERT INTO tock_memory_fts (id, content) VALUES (?, ?)`, id, item.content);
        if (item.supersedesId) {
          this.sql.exec(
            `UPDATE tock_memory_items SET superseded_by = ? WHERE id = ?`,
            id,
            item.supersedesId,
          );
          this.sql.exec(`DELETE FROM tock_memory_fts WHERE id = ?`, item.supersedesId);
        }
        addedIds.push(id);
      }

      for (const open of batch.upsertOpenItems ?? []) {
        const id = open.id || crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO tock_open_items (id, title, context, session_id, status, due_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             context = excluded.context,
             session_id = excluded.session_id,
             status = excluded.status,
             due_at = excluded.due_at,
             updated_at = excluded.updated_at`,
          id,
          open.title,
          open.context ?? "",
          open.sessionId ?? null,
          open.status ?? "open",
          open.dueAt ?? null,
          now,
        );
        openIds.push(id);
      }
    });

    return { addedIds, openIds };
  }

  renderStableContext(): string {
    const parts: string[] = [];
    const core = this.getCore();
    if (core.content.trim()) {
      parts.push(`## Core Memory\n${core.content.trim()}`);
    }
    const open = this.listOpenItems("open");
    if (open.length > 0) {
      const lines = open.map(
        (o) => `- [${o.id.slice(0, 8)}] ${o.title}${o.context ? ` — ${o.context}` : ""}`,
      );
      parts.push(`## Open Items\n${lines.join("\n")}`);
    }
    return parts.join("\n\n");
  }

  renderQueryRecall(queryText: string, limit = 6): string {
    const trimmed = queryText.trim();
    if (!trimmed) return "";
    const hits = this.search(trimmed, limit);
    if (hits.length === 0) return "";
    const lines = hits.map((h) => `- (${h.kind}) ${h.content}`);
    return `## Relevant Memory\n${lines.join("\n")}`;
  }

  renderAutoContext(queryText: string): string {
    const parts: string[] = [];
    const stable = this.renderStableContext();
    if (stable) parts.push(stable);
    const hits = this.search(queryText, 6);
    if (hits.length > 0) {
      const lines = hits.map((h) => `- (${h.kind}) ${h.content}`);
      parts.push(`## Relevant Memory\n${lines.join("\n")}`);
    }
    return parts.join("\n\n");
  }

  async consolidateWithModel(
    models: Models,
    model: Model<Api>,
    sessionId: string,
    transcriptText: string,
    redact?: (text: string) => Promise<string>,
  ): Promise<{ updated: boolean; addedFacts: number; updatedOpen: number }> {
    const scrubbedTranscript = redact ? await redact(transcriptText) : transcriptText;
    const currentCore = this.getCore().content;
    const currentOpen = this.listOpenItems("open");
    const systemPrompt = [
      "You consolidate personal agent memory across threads. Return strict JSON only with shape:",
      '{"coreContent":"optional updated compact markdown dossier under 1200 words","addItems":[{"kind":"fact|decision|summary|preference","content":"..."}],"upsertOpenItems":[{"id":"optional","title":"...","context":"...","status":"open|resolved"}]}',
      "Preserve active projects, preferences, and ongoing tasks so any new chat immediately knows them. Never store secrets or tokens. Omit unchanged fields.",
    ].join("\n");

    const userPrompt = [
      `Current Core Memory:\n${currentCore || "(empty)"}`,
      `Current Open Items:\n${JSON.stringify(currentOpen)}`,
      `Recent Transcript (session ${sessionId}):\n${scrubbedTranscript.slice(-8000)}`,
    ].join("\n\n");

    const msg = await models.completeSimple(
      model,
      { systemPrompt, messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }] },
      { sessionId: `tock-mem-${sessionId}` },
    );
    const raw = contentText(msg.content).trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { updated: false, addedFacts: 0, updatedOpen: 0 };

    let parsed: MemoryBatchInput;
    try {
      parsed = JSON.parse(jsonMatch[0]) as MemoryBatchInput;
    } catch {
      return { updated: false, addedFacts: 0, updatedOpen: 0 };
    }

    const coreContent =
      typeof parsed.coreContent === "string" && parsed.coreContent.trim()
        ? redact
          ? await redact(parsed.coreContent.trim())
          : parsed.coreContent.trim()
        : undefined;

    const addItems = await Promise.all(
      (parsed.addItems ?? []).map(async (i) => ({
        ...i,
        content: redact ? await redact(i.content) : i.content,
        sourceSessionId: sessionId,
      })),
    );

    const upsertOpenItems = await Promise.all(
      (parsed.upsertOpenItems ?? []).map(async (o) => ({
        ...o,
        title: redact ? await redact(o.title) : o.title,
        context: o.context && redact ? await redact(o.context) : o.context,
        sessionId,
      })),
    );

    const res = this.applyBatch({ coreContent, addItems, upsertOpenItems });
    return {
      updated: true,
      addedFacts: res.addedIds.length,
      updatedOpen: res.openIds.length,
    };
  }
}
