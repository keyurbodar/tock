# tock

Durable personal agent backend on Cloudflare Workers Free Plan: one Worker, one SQLite Durable Object per owner.

## Architecture

- **Runtime**: Cloudflare Workers + SQLite Durable Objects (`agents/lifecycle`, `agents/schedules`, `agents/harness/pi`), `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, and `@earendil-works/djs`.
- **Transport**: Plain JSON over Durable Object WebSocket Hibernation (`/ws`, cursor stored in socket attachment) + Native DO RPC between Worker and `TockDO`.
- **Auth**: Cloudflare Zero Trust Access JWT verification (`Cf-Access-Jwt-Assertion`), fail-closed `401` unless `DEV_ALLOW_ANON=1` in local dev.
- **Unified Memory**: Cross-thread SQLite FTS5 (`tock_memory_core`, `tock_memory_items`, `tock_memory_fts`, `tock_open_items`) with single-transaction batched writes and 5-minute idle consolidation.
- **Vault**: Single Web Crypto AES-256-GCM encrypted `tock_secrets` table with `{{secret:name}}` boundary injection and automatic output redaction.
- **Remote MCP**: Generic vendor-agnostic Streamable HTTP JSON-RPC client (`tock_mcp_servers`) so any coding-agent hub (such as `t3code`) or external connector plugs in without hardcoded adapters.
- **Subagents**: Native `pi-durable` owned child conversations with user-configurable concurrency (`maxSubagents`, 1-10).
- **Codemode & Dev Mode**: Free-plan TypeScript WASM sandbox via `@earendil-works/djs` with memory and fuel limits, vault-scoped host functions, and opt-in `dev_mode` plugins.

## Commands

```bash
bun install
bun run typecheck
bun run lint
bun run test
bun run dev
bun run deploy
```
