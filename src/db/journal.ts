import type { Context } from "@earendil-works/chord/context";
import {
  type CommitResult,
  type Cursor,
  type DocumentAddress,
  MemoryStorage,
  type Page,
  type Seq,
  type Storage,
  type StorageWrite,
} from "@earendil-works/pi-durable";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";

const FLUSH_BYTES = 1_000_000;
const PART_BYTES = 1_500_000;
const CHECKPOINT_ROWS = 256;
const SLOTS = CHECKPOINT_ROWS + 32;
const PAGE = 500;
const LEGACY_TABLES = [
  "pi_journal",
  "pi_durable_schema",
  "pi_durable_metadata",
  "pi_record_ids",
  "pi_conversations",
  "pi_entries",
  "pi_tasks",
  "pi_submissions",
  "pi_documents",
  "pi_document_revisions",
] as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

type Commit = { readonly seq: Seq; readonly writes: readonly StorageWrite[] };
type Batch = { readonly seq: Seq; readonly commits: readonly Commit[] };
type JournalRow = {
  readonly slot: number;
  readonly seq: number;
  readonly part: number;
  readonly parts: number;
  readonly bytes: number;
  readonly data: ArrayBuffer | null;
};

const bytesOf = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

export class JournalStorage extends MemoryStorage {
  readonly #store: DurableObjectStorage;
  readonly #kinds = new Map<number, string>();
  #pending: Commit[] = [];
  #pendingBytes = 0;
  #journalled = 0;
  #uncovered = 0;
  #slot = 0;
  #lastSeq = 0;
  #live = false;
  #checkpointing: Promise<void> | undefined;
  #gate: Promise<void> = Promise.resolve();

  private constructor(store: DurableObjectStorage) {
    super();
    this.#store = store;
  }

  static async open(store: DurableObjectStorage, context: Context): Promise<JournalStorage> {
    const journal = new JournalStorage(store);
    journal.#migrate();
    const legacyJournal = journal.#hasTable("pi_journal");
    const restored = await journal.#restore(legacyJournal);
    if (!restored && journal.#hasTable("pi_conversations")) await journal.#import(context);
    else if (legacyJournal) await journal.checkpoint(context);
    journal.#dropLegacy();
    journal.#live = true;
    return journal;
  }

  override async commit(
    batches: readonly (readonly StorageWrite[])[],
    receive: (index: number, seq: Seq) => void,
    context: Context,
  ): Promise<CommitResult> {
    while (this.#checkpointing !== undefined) await this.#gate;
    const seqs: Seq[] = [];
    const result = await super.commit(
      batches,
      (index, seq) => {
        seqs[index] = seq;
        receive(index, seq);
      },
      context,
    );
    if (!this.#live || result.stored === 0) return result;
    let boundary = false;
    let config = false;
    for (let index = 0; index < result.stored; index++) {
      const writes = batches[index] ?? [];
      const seq = seqs[index] as Seq;
      this.#learn(writes);
      this.#pending.push({ seq, writes });
      this.#lastSeq = Math.max(this.#lastSeq, seq);
      this.#pendingBytes += bytesOf(writes).length;
      boundary ||= writes.some((write) => write.type === "submission");
      config ||= writes.some(
        (write) =>
          (write.type === "document.change" && this.#kinds.get(write.id) !== "pi.live") ||
          (write.type === "document.create" && write.record.kind !== "pi.live"),
      );
    }
    if (boundary || config || this.#pendingBytes >= FLUSH_BYTES) {
      this.#flush();
      if (this.#journalled >= CHECKPOINT_ROWS || this.#pending.length > 0) {
        this.#journalled = 0;
        await this.checkpoint(context);
      }
    }
    return result;
  }

  override async close(context: Context): Promise<void> {
    if (this.#live) {
      this.#flush();
      await this.checkpoint(context);
    }
    await super.close(context);
  }

  checkpoint(context: Context): Promise<void> {
    return (this.#checkpointing ??= this.#writeCheckpoint(context).finally(() => {
      this.#checkpointing = undefined;
    }));
  }

  async #writeCheckpoint(context: Context): Promise<void> {
    this.#flush();
    const gate = Promise.withResolvers<void>();
    this.#gate = gate.promise;
    try {
      const writes = await snapshot(this, context);
      const seq = Math.max(this.#lastSeq, 1) as Seq;
      const parts = split(bytesOf({ seq, writes }));
      this.#store.transactionSync(() => {
        this.#write(
          "INSERT INTO pi_checkpoint (singleton, seq, parts, bytes) VALUES (1, ?, ?, ?) ON CONFLICT (singleton) DO UPDATE SET seq = excluded.seq, parts = excluded.parts, bytes = excluded.bytes",
          [seq, parts.length, parts.reduce((total, part) => total + part.length, 0)],
        );
        for (const [index, part] of parts.entries()) {
          this.#write(
            "INSERT INTO pi_checkpoint_part (part, data) VALUES (?, ?) ON CONFLICT (part) DO UPDATE SET data = excluded.data",
            [index, part.buffer as ArrayBuffer],
          );
        }
      });
      this.#journalled = 0;
      this.#uncovered = 0;
      this.#pending = [];
      this.#pendingBytes = 0;
    } finally {
      gate.resolve();
    }
  }

  #migrate(): void {
    this.#write(
      "CREATE TABLE IF NOT EXISTS pi_journal_ring (slot INTEGER NOT NULL, part INTEGER NOT NULL, seq INTEGER NOT NULL, parts INTEGER NOT NULL, bytes INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (slot, part)) WITHOUT ROWID, STRICT",
      [],
    );
    this.#write(
      "CREATE TABLE IF NOT EXISTS pi_checkpoint (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), seq INTEGER NOT NULL, parts INTEGER NOT NULL, bytes INTEGER NOT NULL) STRICT",
      [],
    );
    this.#write(
      "CREATE TABLE IF NOT EXISTS pi_checkpoint_part (part INTEGER PRIMARY KEY, data BLOB NOT NULL) STRICT",
      [],
    );
  }

  async #restore(legacyJournal: boolean): Promise<boolean> {
    const checkpoint = this.#read<{ seq: number; parts: number; bytes: number }>(
      "SELECT seq, parts, bytes FROM pi_checkpoint WHERE singleton = 1",
      [],
    )[0];
    if (checkpoint !== undefined) {
      const stored = this.#read<{ data: ArrayBuffer }>(
        "SELECT data FROM pi_checkpoint_part WHERE part < ? ORDER BY part",
        [checkpoint.parts],
      );
      const envelope = parse<{ seq: Seq; writes: StorageWrite[] }>(
        join(
          stored.map((row) => row.data),
          checkpoint.bytes,
        ),
      );
      this.prepareCommit(envelope.writes, envelope.seq).apply();
      this.#learn(envelope.writes);
      this.#lastSeq = Math.max(this.#lastSeq, envelope.seq);
    }
    const covered = checkpoint?.seq ?? 0;
    const ring = this.#read<JournalRow>(
      "SELECT slot, seq, part, parts, bytes, CASE WHEN seq > ? THEN data END AS data FROM pi_journal_ring",
      [covered],
    );
    const last = ring.reduce<JournalRow | undefined>(
      (newest, row) => (newest === undefined || row.seq > newest.seq ? row : newest),
      undefined,
    );
    if (last !== undefined) this.#slot = (last.slot + 1) % SLOTS;
    const legacy = legacyJournal
      ? this.#read<JournalRow>(
          "SELECT -1 AS slot, seq, part, parts, bytes, data FROM pi_journal WHERE seq > ? ORDER BY seq, part",
          [covered],
        )
      : [];
    const rows = [...legacy, ...ring.filter((row) => row.seq > covered)].toSorted(
      (left, right) => left.seq - right.seq || left.part - right.part,
    );
    for (const group of groups(rows)) {
      const first = group[0];
      if (first === undefined) continue;
      const envelope = parse<Batch>(
        join(
          group.map((row) => row.data ?? new ArrayBuffer(0)),
          first.bytes,
        ),
      );
      for (const commit of envelope.commits) {
        if (commit.seq <= covered) continue;
        this.prepareCommit(commit.writes, commit.seq).apply();
        this.#learn(commit.writes);
        this.#lastSeq = Math.max(this.#lastSeq, commit.seq);
      }
      this.#journalled += 1;
      if (first.slot >= 0) this.#uncovered += 1;
    }
    return checkpoint !== undefined || rows.length > 0;
  }

  #hasTable(name: "pi_journal" | "pi_conversations"): boolean {
    return this.#read(`PRAGMA table_list('${name}')`, []).length > 0;
  }

  async #import(context: Context): Promise<void> {
    const legacy = await openDurableObjectSqliteStorage(this.#store, { prefix: "pi_" });
    try {
      const writes = await snapshot(legacy, context);
      if (writes.length === 0) return;
      this.prepareCommit(writes, (this.#lastSeq + 1) as Seq).apply();
      this.#lastSeq += 1;
      await this.checkpoint(context);
    } finally {
      await legacy.close(context);
    }
  }

  #dropLegacy(): void {
    for (const table of LEGACY_TABLES) this.#write(`DROP TABLE IF EXISTS ${table}`, []);
  }

  #flush(): void {
    const commits = this.#pending;
    const last = commits[commits.length - 1];
    if (last === undefined || this.#uncovered >= SLOTS) return;
    this.#pending = [];
    this.#pendingBytes = 0;
    const parts = split(bytesOf({ seq: last.seq, commits } satisfies Batch));
    const seq: number = last.seq;
    const slot = this.#slot;
    this.#store.transactionSync(() => {
      for (const [index, part] of parts.entries()) {
        this.#write(
          "INSERT INTO pi_journal_ring (slot, part, seq, parts, bytes, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (slot, part) DO UPDATE SET seq = excluded.seq, parts = excluded.parts, bytes = excluded.bytes, data = excluded.data",
          [
            slot,
            index,
            seq,
            parts.length,
            parts.reduce((total, chunk) => total + chunk.length, 0),
            part.buffer as ArrayBuffer,
          ],
        );
      }
    });
    this.#slot = (slot + 1) % SLOTS;
    this.#uncovered += 1;
    this.#journalled += 1;
  }

  #learn(writes: readonly StorageWrite[]): void {
    for (const write of writes) {
      if (write.type === "document.create") this.#kinds.set(write.record.id, write.record.kind);
    }
  }

  #read<T extends Record<string, SqlStorageValue>>(sql: string, params: SqlStorageValue[]): T[] {
    return this.#store.sql.exec<T>(sql, ...params).toArray();
  }

  #write(sql: string, params: SqlStorageValue[]): void {
    this.#store.sql.exec(sql, ...params).toArray();
  }
}

async function snapshot(reader: Storage, context: Context): Promise<StorageWrite[]> {
  const writes: StorageWrite[] = [];
  const conversations = await all((cursor) => reader.scanConversations({}, PAGE, cursor, context));
  const tasks = await all((cursor) => reader.scanTasks({}, PAGE, cursor, context));
  const submissions = await all((cursor) => reader.scanSubmissions({}, PAGE, cursor, context));
  for (const conversation of conversations)
    writes.push({ type: "conversation", value: conversation });
  for (const task of tasks) writes.push({ type: "task", value: task });
  for (const submission of submissions) writes.push({ type: "submission", value: submission });
  const scopes: DocumentAddress["scope"][] = [
    { kind: "session" },
    ...conversations.map((record) => ({
      kind: "conversation" as const,
      conversationId: record.id,
    })),
    ...tasks.map((record) => ({ kind: "task" as const, taskId: record.id })),
  ];
  for (const scope of scopes) {
    for (const record of await all((cursor) =>
      reader.scanDocuments({ scope, at: "current" }, PAGE, cursor, context),
    )) {
      const stored = await reader.document(record.id, "current", context);
      if (stored === undefined) continue;
      writes.push({
        type: "document.create",
        record: stored.record,
        content: { kind: "base", version: stored.version, value: stored.value },
      });
    }
  }
  for (const conversation of conversations) {
    const entries = await all((cursor) =>
      reader.scanEntries(
        { conversationId: conversation.id, order: "ascending" },
        PAGE,
        cursor,
        context,
      ),
    );
    for (const entry of entries) writes.push({ type: "entry", value: entry });
  }
  return writes;
}

async function all<T>(
  scan: (cursor: Cursor | undefined) => Promise<Page<T, Cursor>>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: Cursor | undefined;
  for (;;) {
    const page = await scan(cursor);
    items.push(...page.items);
    if (page.next === undefined) return items;
    cursor = page.next;
  }
}

function split(bytes: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += PART_BYTES) {
    parts.push(bytes.slice(start, start + PART_BYTES));
  }
  return parts.length === 0 ? [new Uint8Array()] : parts;
}

function join(parts: readonly ArrayBuffer[], bytes: number): Uint8Array {
  const value = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    const chunk = new Uint8Array(part);
    value.set(chunk, offset);
    offset += chunk.length;
  }
  return value;
}

function parse<T>(bytes: Uint8Array): T {
  return JSON.parse(decoder.decode(bytes)) as T;
}

function groups(rows: readonly JournalRow[]): JournalRow[][] {
  const grouped: JournalRow[][] = [];
  for (const row of rows) {
    const last = grouped.at(-1);
    if (last !== undefined && last[0]?.seq === row.seq) last.push(row);
    else grouped.push([row]);
  }
  return grouped;
}
