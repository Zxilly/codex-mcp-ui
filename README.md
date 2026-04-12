# codex-mcp-ui

Single-binary MITM proxy that sits between an MCP client and `codex mcp-server`, normalizes observed traffic into typed events, and serves a local read-only dashboard over SSE.

## Build

```bash
# Build embedded UI assets first so the Go binary includes them.
pnpm --dir web install
pnpm --dir web run build

# Build the binary.
go build -o bin/codex-mcp-ui ./cmd/codex-mcp-ui
```

The UI build writes to `internal/hub/web/dist/`, which is embedded via `//go:embed` in `internal/hub/web/assets.go`.

## Run

Proxy mode is the default. Pass downstream `codex` arguments after `--`:

```bash
codex-mcp-ui --ui-port 8787 -- --sandbox workspace-write
```

The proxy will self-spawn a detached local hub on `127.0.0.1:8787` if one is not already running, then launch `codex mcp-server ...` and bridge stdio in both directions while observing a curated subset of MCP traffic.

Open `http://127.0.0.1:8787/` for the dashboard. Deep links like `http://127.0.0.1:8787/#thread=<id>` restore the selected session on reload.

### Hub management

```bash
codex-mcp-ui server status --ui-port 8787   # JSON status (handshake + PID + data dir)
codex-mcp-ui server stop   --ui-port 8787   # graceful shutdown
```

`codex-mcp-ui hub serve` exists but is hidden — it is the target of the self-spawn and not intended for direct use. The hub also shuts itself down after a configurable idle timeout (`--idle-timeout`, default `30m`, zero disables).

## Frontend development

```bash
pnpm --dir web run dev           # Vite dev server on :5178
pnpm --dir web run test          # Vitest unit (jsdom)
pnpm --dir web run test:browser  # Vitest browser e2e (Playwright-driven Chromium)
pnpm --dir web run test:all      # run both projects
pnpm --dir web run lint          # ESLint (antfu preset)
pnpm --dir web run build         # production build → internal/hub/web/dist
```

Dependencies are tracked in `web/pnpm-lock.yaml`; keep them fresh with `pnpm --dir web dlx npm-check-updates -u && pnpm --dir web install`.

## Tests

```bash
go test ./cmd/... ./internal/... ./integration/...
pnpm --dir web run test
pnpm --dir web run test:browser
```

Coverage profile:

```bash
go test -coverprofile=coverage.out ./cmd/... ./internal/... ./integration/...
go tool cover -html=coverage.out
```

## Architecture

- **Proxy** (`internal/proxy`): launches downstream `codex mcp-server`, bridges stdio frames, observes `initialize`, `tools/call`, `notifications/cancelled`, `codex/event`, `elicitation/create`, and responses for active calls. Ships normalized envelopes to the hub on a bounded worker queue; traffic forwarding continues and degraded state is surfaced once if the hub becomes unreachable.
- **Hub** (`internal/hub`): loopback-only HTTP service with handshake, ingest, query, SSE fanout, and embedded UI. Persists events to SQLite via `sqlc`-generated prepared statements with Goose migrations.
- **Frontend** (`web/`): React + shadcn/ui dashboard with an error boundary, loading/empty states, a live-connection badge, URL-hash session persistence, and tabs for Milestones / Raw events / Metadata. Uses TanStack Query for REST and `@microsoft/fetch-event-source` for SSE patch-in.

## Known v1 limits

- Single local hub per port; no cross-host operation.
- Observed event schema is a minimal curated subset; arbitrary MCP methods pass through unannotated.
- Dashboard is read-only — no replay, edit, or cancel actions.
- Goose migrations are embedded; no downgrade path exposed.
- SSE resume via `Last-Event-ID` / `?since=` works within the broker's in-memory ring buffer (512 events); history beyond that must be paged via `GET /api/v1/sessions/{threadId}/events`.
