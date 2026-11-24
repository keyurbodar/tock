const SCHEMA_STATEMENTS = [
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
  `CREATE TABLE IF NOT EXISTS tock_plugin_continuations (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    dump_js TEXT NOT NULL,
    fuel_used INTEGER NOT NULL DEFAULT 0,
    wake_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'suspended',
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tock_webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    secret_name TEXT NOT NULL,
    filter_plugin_id TEXT,
    prompt_template TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tock_push_subs (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_items_active ON tock_memory_items(superseded_by, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_open_items_status ON tock_open_items(status, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_continuations_wake ON tock_plugin_continuations(status, wake_at)`
] as const;

export function ensureSchema(sql: SqlStorage, defaultTimezone = "UTC"): void {
  for (const stmt of SCHEMA_STATEMENTS) {
    sql.exec(stmt);
  }
  const now = Date.now();
  sql.exec(
    `INSERT OR IGNORE INTO tock_settings (id, dev_mode, max_subagents, timezone, updated_at) VALUES (1, 0, 3, ?, ?)`,
    defaultTimezone,
    now
  );
  sql.exec(
    `INSERT OR IGNORE INTO tock_memory_core (id, content, version, updated_at) VALUES (1, '', 1, ?)`,
    now
  );
}
