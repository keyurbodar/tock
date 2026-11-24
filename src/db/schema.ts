type Migration = (sql: SqlStorage, defaultTimezone: string) => void;

function addColumnIfMissing(
  sql: SqlStorage,
  table: string,
  column: string,
  definition: string,
): void {
  const exists = sql
    .exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray()
    .some((c) => c.name === column);
  if (!exists) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const MIGRATIONS: readonly Migration[] = [
  (sql, defaultTimezone) => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS tock_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        dev_mode INTEGER NOT NULL DEFAULT 0,
        max_subagents INTEGER NOT NULL DEFAULT 3,
        model TEXT,
        background_model TEXT,
        fallback_model TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_memory_core (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_memory_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source_session_id TEXT,
        superseded_by TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS tock_memory_fts USING fts5(
        id UNINDEXED,
        content,
        tokenize='porter unicode61'
      )`,
      `CREATE TABLE IF NOT EXISTS tock_open_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        due_at INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_secrets (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        scopes TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT '',
        ciphertext_b64 TEXT NOT NULL,
        iv_b64 TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        check_script TEXT,
        quiet_if_unchanged INTEGER NOT NULL DEFAULT 1,
        last_hash TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        scheduler_job_id TEXT,
        last_run_at INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        headers_json TEXT NOT NULL DEFAULT '{}',
        auth_mode TEXT NOT NULL DEFAULT 'headers',
        manager_server_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_dev_plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        schema_json TEXT NOT NULL DEFAULT '{}',
        ts_source TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_kind TEXT NOT NULL,
        r2_key TEXT,
        blob_data BLOB,
        session_id TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_skills (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        commit_sha TEXT,
        body_md TEXT NOT NULL,
        files_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_push_subs (
        endpoint TEXT PRIMARY KEY,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_subagents (
        task_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        started_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tock_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        event TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memory_items_active ON tock_memory_items(superseded_by, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_open_items_status ON tock_open_items(status, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_files_created ON tock_files(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_events_session_seq ON tock_events(session_id, seq)`,
    ];
    for (const stmt of statements) {
      sql.exec(stmt);
    }
    const now = Date.now();
    sql.exec(
      `INSERT OR IGNORE INTO tock_settings (id, dev_mode, max_subagents, timezone, updated_at) VALUES (1, 0, 3, ?, ?)`,
      defaultTimezone,
      now,
    );
    sql.exec(
      `INSERT OR IGNORE INTO tock_memory_core (id, content, version, updated_at) VALUES (1, '', 1, ?)`,
      now,
    );
  },
  (sql) => {
    addColumnIfMissing(sql, "tock_secrets", "origin", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(sql, "tock_mcp_servers", "manager_server_id", "TEXT");
    sql.exec(
      `UPDATE OR IGNORE tock_secrets
       SET name = 'llm:' || substr(description, 1, length(description) - length(' API key'))
       WHERE scopes = 'llm' AND name NOT LIKE 'llm:%' AND description LIKE '% API key'`,
    );
  },
  (sql) => {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS tock_memory_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    );
    sql.exec(
      `INSERT INTO tock_memory_revisions (version, source, content, created_at)
       SELECT version, 'migration', content, updated_at
       FROM tock_memory_core
       WHERE id = 1 AND length(trim(content)) > 0`,
    );
    sql.exec(`DROP TABLE IF EXISTS tock_memory_fts`);
    sql.exec(
      `CREATE VIRTUAL TABLE tock_memory_fts USING fts5 (
        id UNINDEXED,
        content,
        tokenize = 'porter unicode61'
      )`,
    );
    sql.exec(
      `INSERT INTO tock_memory_fts (id, content)
       SELECT id, content FROM tock_memory_items WHERE superseded_by IS NULL`,
    );
  },
];

export function ensureSchema(sql: SqlStorage, defaultTimezone = "UTC"): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS tock_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const rows = sql
    .exec<{ value: string }>(`SELECT value FROM tock_meta WHERE key = 'schema_version'`)
    .toArray();
  const current = rows[0] ? Number(rows[0].value) : 0;
  if (current >= MIGRATIONS.length) return;
  for (let i = current; i < MIGRATIONS.length; i++) {
    MIGRATIONS[i]!(sql, defaultTimezone);
    sql.exec(
      `INSERT INTO tock_meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      String(i + 1),
    );
  }
}
