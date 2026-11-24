import type { FileMeta } from "../types.js";

const MAX_SQLITE_BLOB_BYTES = 4 * 1024 * 1024;

export class FileStore {
  private readonly sql: SqlStorage;
  private readonly bucket: R2Bucket | undefined;

  constructor(sql: SqlStorage, bucket?: R2Bucket) {
    this.sql = sql;
    this.bucket = bucket;
  }

  async put(
    name: string,
    mime: string,
    bytes: Uint8Array,
    sessionId: string | null = null
  ): Promise<FileMeta> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const size = bytes.byteLength;

    if (this.bucket) {
      const r2Key = `files/${id}/${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await this.bucket.put(r2Key, bytes, { httpMetadata: { contentType: mime } });
      this.sql.exec(
        `INSERT INTO tock_files (id, name, mime, size, storage_kind, r2_key, blob_data, session_id, created_at)
         VALUES (?, ?, ?, ?, 'r2', ?, NULL, ?, ?)`,
        id,
        name,
        mime,
        size,
        r2Key,
        sessionId,
        now
      );
      return { id, name, mime, size, storageKind: "r2", sessionId, createdAt: now };
    }

    if (size > MAX_SQLITE_BLOB_BYTES) {
      throw new Error(`file_too_large_without_r2_max_${MAX_SQLITE_BLOB_BYTES}`);
    }
    this.sql.exec(
      `INSERT INTO tock_files (id, name, mime, size, storage_kind, r2_key, blob_data, session_id, created_at)
       VALUES (?, ?, ?, ?, 'sqlite', NULL, ?, ?, ?)`,
      id,
      name,
      mime,
      size,
      bytes,
      sessionId,
      now
    );
    return { id, name, mime, size, storageKind: "sqlite", sessionId, createdAt: now };
  }

  async get(id: string): Promise<{ meta: FileMeta; bytes: Uint8Array } | null> {
    const rows = this.sql
      .exec(
        `SELECT id, name, mime, size, storage_kind, r2_key, blob_data, session_id, created_at
         FROM tock_files WHERE id = ?`,
        id
      )
      .toArray();
    const r = rows[0];
    if (!r) return null;

    const meta: FileMeta = {
      id: String(r.id),
      name: String(r.name),
      mime: String(r.mime),
      size: Number(r.size),
      storageKind: r.storage_kind === "r2" ? "r2" : "sqlite",
      sessionId: r.session_id ? String(r.session_id) : null,
      createdAt: Number(r.created_at)
    };

    if (meta.storageKind === "r2" && this.bucket && r.r2_key) {
      const obj = await this.bucket.get(String(r.r2_key));
      if (!obj) return null;
      return { meta, bytes: new Uint8Array(await obj.arrayBuffer()) };
    }

    const blob: unknown = r.blob_data;
    if (blob instanceof ArrayBuffer) {
      return { meta, bytes: new Uint8Array(blob) };
    }
    if (blob instanceof Uint8Array) {
      return { meta, bytes: blob };
    }
    return null;
  }

  async readText(id: string): Promise<{ meta: FileMeta; text: string } | null> {
    const found = await this.get(id);
    if (!found) return null;
    return { meta: found.meta, text: new TextDecoder().decode(found.bytes) };
  }

  list(sessionId?: string): FileMeta[] {
    const rows = sessionId
      ? this.sql
          .exec(
            `SELECT id, name, mime, size, storage_kind, session_id, created_at
             FROM tock_files WHERE session_id = ? ORDER BY created_at DESC LIMIT 50`,
            sessionId
          )
          .toArray()
      : this.sql
          .exec(
            `SELECT id, name, mime, size, storage_kind, session_id, created_at
             FROM tock_files ORDER BY created_at DESC LIMIT 50`
          )
          .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      mime: String(r.mime),
      size: Number(r.size),
      storageKind: r.storage_kind === "r2" ? "r2" : "sqlite",
      sessionId: r.session_id ? String(r.session_id) : null,
      createdAt: Number(r.created_at)
    }));
  }

  async delete(id: string): Promise<boolean> {
    const rows = this.sql
      .exec(`SELECT storage_kind, r2_key FROM tock_files WHERE id = ?`, id)
      .toArray();
    const r = rows[0];
    if (!r) return false;
    if (r.storage_kind === "r2" && this.bucket && r.r2_key) {
      await this.bucket.delete(String(r.r2_key));
    }
    this.sql.exec(`DELETE FROM tock_files WHERE id = ?`, id);
    return true;
  }
}
