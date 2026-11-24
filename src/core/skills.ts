import type { SkillRecord } from "../types.js";
import type { ExecutionGuards } from "./guards.js";

function parseFrontmatter(md: string): { name?: string; description?: string; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: md };
  const yaml = m[1] ?? "";
  const body = m[2] ?? "";
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const description = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  return { name, description, body };
}

function parseGitHubSkillTarget(input: string): { owner: string; repo: string; ref: string; path: string } | null {
  const cleaned = input.trim().replace(/^npx\s+skills\s+add\s+/, "").trim();
  const skillFlag = cleaned.match(/--skill\s+([a-zA-Z0-9_.-]+)/)?.[1];
  const urlMatch = cleaned.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^/\s]+)\/([^\s#?]+))?/);
  if (urlMatch) {
    const owner = urlMatch[1]!;
    const repo = urlMatch[2]!.replace(/\.git$/, "");
    const ref = urlMatch[3] || "main";
    const path = urlMatch[4] || (skillFlag ? `skills/${skillFlag}` : "");
    return { owner, repo, ref, path: path.replace(/\/$/, "") };
  }
  const shortMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/([^\s]+))?/);
  if (shortMatch) {
    return {
      owner: shortMatch[1]!,
      repo: shortMatch[2]!,
      ref: "main",
      path: (shortMatch[3] || (skillFlag ? `skills/${skillFlag}` : "")).replace(/\/$/, "")
    };
  }
  return null;
}

export class SkillStore {
  private readonly sql: SqlStorage;
  private readonly guards: ExecutionGuards;

  constructor(sql: SqlStorage, guards: ExecutionGuards) {
    this.sql = sql;
    this.guards = guards;
  }

  list(): SkillRecord[] {
    return this.sql
      .exec(
        `SELECT name, description, source, commit_sha, body_md, files_json, enabled, updated_at
         FROM tock_skills ORDER BY name ASC`
      )
      .toArray()
      .map((r) => this.mapRow(r));
  }

  get(name: string): SkillRecord | undefined {
    const rows = this.sql
      .exec(
        `SELECT name, description, source, commit_sha, body_md, files_json, enabled, updated_at
         FROM tock_skills WHERE name = ?`,
        name
      )
      .toArray();
    return rows[0] ? this.mapRow(rows[0]) : undefined;
  }

  upsert(input: {
    name?: string;
    description?: string;
    source?: string;
    commitSha?: string | null;
    bodyMd: string;
    files?: Record<string, string>;
    enabled?: boolean;
  }): SkillRecord {
    const parsed = parseFrontmatter(input.bodyMd);
    const name = (input.name || parsed.name || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-|-$/g, "");
    if (!name) {
      throw new Error("skill_name_required");
    }
    const description = input.description ?? parsed.description ?? "";
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO tock_skills (name, description, source, commit_sha, body_md, files_json, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         source = excluded.source,
         commit_sha = excluded.commit_sha,
         body_md = excluded.body_md,
         files_json = excluded.files_json,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      name,
      description,
      input.source ?? "manual",
      input.commitSha ?? null,
      input.bodyMd,
      JSON.stringify(input.files ?? {}),
      input.enabled === false ? 0 : 1,
      now
    );
    return this.get(name)!;
  }

  delete(name: string): boolean {
    const exists = this.sql.exec(`SELECT name FROM tock_skills WHERE name = ?`, name).toArray().length;
    if (exists === 0) return false;
    this.sql.exec(`DELETE FROM tock_skills WHERE name = ?`, name);
    return true;
  }

  async importSource(source: string): Promise<SkillRecord[]> {
    const gh = parseGitHubSkillTarget(source);
    if (gh) {
      return [await this.importGitHub(gh)];
    }
    if (source.startsWith("http://") || source.startsWith("https://")) {
      return this.importWellKnownOrRaw(source);
    }
    throw new Error("unsupported_skill_source");
  }

  private async importGitHub(target: { owner: string; repo: string; ref: string; path: string }): Promise<SkillRecord> {
    const check = this.guards.recordSubrequest(2);
    if (!check.allowed) throw new Error(`subrequest_budget_exceeded_${check.limit}`);

    const headers = { accept: "application/vnd.github+json", "user-agent": "tock-agent" };
    const commitRes = await fetch(
      `https://api.github.com/repos/${target.owner}/${target.repo}/commits/${target.ref}`,
      { headers }
    );
    const commitSha = commitRes.ok ? ((await commitRes.json()) as { sha?: string }).sha ?? target.ref : target.ref;

    const skillPath = target.path ? `${target.path}/SKILL.md` : "SKILL.md";
    const rawUrl = `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${commitSha}/${skillPath}`;
    const skillRes = await fetch(rawUrl, { headers: { "user-agent": "tock-agent" } });
    if (!skillRes.ok) {
      throw new Error(`github_skill_fetch_failed_${skillRes.status}`);
    }
    const bodyMd = await skillRes.text();
    const fallbackName = target.path.split("/").pop() || target.repo;
    return this.upsert({
      name: parseFrontmatter(bodyMd).name || fallbackName,
      source: `github:${target.owner}/${target.repo}/${target.path}`,
      commitSha,
      bodyMd
    });
  }

  private async importWellKnownOrRaw(url: string): Promise<SkillRecord[]> {
    const check = this.guards.recordSubrequest(1);
    if (!check.allowed) throw new Error(`subrequest_budget_exceeded_${check.limit}`);
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith(".md")) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`skill_fetch_failed_${res.status}`);
      const bodyMd = await res.text();
      return [this.upsert({ source: url, bodyMd })];
    }

    const indexUrl = `${parsedUrl.origin}/.well-known/agent-skills/index.json`;
    const idxRes = await fetch(indexUrl);
    if (!idxRes.ok) throw new Error(`well_known_skills_failed_${idxRes.status}`);
    const idx = (await idxRes.json()) as {
      skills?: Array<{ name: string; description?: string; url?: string }>;
    };
    const installed: SkillRecord[] = [];
    for (const item of (idx.skills ?? []).slice(0, 5)) {
      if (!item.url) continue;
      const sub = this.guards.recordSubrequest(1);
      if (!sub.allowed) break;
      const r = await fetch(new URL(item.url, parsedUrl.origin).toString());
      if (!r.ok) continue;
      const bodyMd = await r.text();
      installed.push(this.upsert({ name: item.name, description: item.description, source: item.url, bodyMd }));
    }
    return installed;
  }

  renderIndex(): string {
    const active = this.list().filter((s) => s.enabled);
    if (active.length === 0) return "";
    return active
      .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""}${s.commitSha ? ` @${s.commitSha.slice(0, 7)}` : ""}`)
      .join("\n");
  }

  readFile(name: string, file?: string): string | null {
    const skill = this.get(name);
    if (!skill) return null;
    if (!file || file === "SKILL.md") return skill.bodyMd;
    const files = JSON.parse(skill.filesJson || "{}") as Record<string, string>;
    return files[file] ?? null;
  }

  private mapRow(r: Record<string, SqlStorageValue>): SkillRecord {
    return {
      name: String(r.name),
      description: String(r.description ?? ""),
      source: String(r.source ?? "manual"),
      commitSha: r.commit_sha ? String(r.commit_sha) : null,
      bodyMd: String(r.body_md),
      filesJson: String(r.files_json ?? "{}"),
      enabled: Number(r.enabled) === 1,
      updatedAt: Number(r.updated_at)
    };
  }
}
