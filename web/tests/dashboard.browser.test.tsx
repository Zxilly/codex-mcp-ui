import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"
import App from "@/App"

const SOURCE_KEY = "claude-desktop-18244"
const THREAD_ID = "thread-abc123"

const clientSource = {
  source_key: SOURCE_KEY,
  client_name: "Claude Desktop",
  pid: 18244,
  protocol_version: "2024-11-05",
  executable: "C:/Program Files/Claude/Claude.exe",
  cwd: "C:/Users/demo",
  first_seen: "2026-04-12T12:00:00Z",
  last_seen: "2026-04-12T12:05:00Z",
  session_count: 1,
}

const session = {
  thread_id: THREAD_ID,
  source_key: SOURCE_KEY,
  model: "gpt-5.4",
  cwd: "C:/Users/demo/project",
  approval_policy: "on-request",
  sandbox: "workspace-write",
  first_seen: "2026-04-12T12:00:05Z",
  last_seen: "2026-04-12T12:04:59Z",
  status: "active",
}

const events = [
  {
    event_id: "evt-1",
    timestamp: "2026-04-12T12:00:05Z",
    proxy_instance_id: "proxy-1",
    source_key: SOURCE_KEY,
    thread_id: THREAD_ID,
    request_id: "req-1",
    turn_id: "turn-1",
    direction: "codex_to_upstream",
    category: "codex_event",
    event_type: "session_configured",
    payload: { model: "gpt-5.4" },
  },
]

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

function installFetchStub() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.endsWith("/api/v1/client-sources")) {
      return jsonResponse({ items: [clientSource] })
    }
    if (url.endsWith(`/api/v1/client-sources/${SOURCE_KEY}/sessions`)) {
      return jsonResponse({ items: [session] })
    }
    if (url.endsWith(`/api/v1/sessions/${THREAD_ID}`)) {
      return jsonResponse({
        session,
        client_source: clientSource,
        recent_events: events,
      })
    }
    if (url.includes(`/api/v1/sessions/${THREAD_ID}/events`)) {
      return jsonResponse({ items: events })
    }
    if (url.includes("/api/v1/stream")) {
      // @microsoft/fetch-event-source issues a real GET; return an empty
      // event-stream so the handler completes without errors.
      return new Response("", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    }
    return jsonResponse({ error: "not found" }, { status: 404 })
  })
}

describe("dashboard (browser e2e)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installFetchStub()
  })

  it("renders the client source header, session, and tabs", async () => {
    const screen = await render(<App />)

    await expect
      .element(screen.getByText("Claude Desktop | pid 18244").first())
      .toBeInTheDocument()

    await expect
      .element(screen.getByRole("tab", { name: "Milestones" }))
      .toBeInTheDocument()

    await expect
      .element(screen.getByRole("tab", { name: "Raw events" }))
      .toBeInTheDocument()
  })

  it("switches to Raw events tab on click", async () => {
    const screen = await render(<App />)

    await screen.getByRole("tab", { name: "Raw events" }).click()

    await expect
      .element(screen.getByLabelText("event type"))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText("Direction").first())
      .toBeInTheDocument()
  })

  it("deep-links to a session via URL hash", async () => {
    window.location.hash = `#thread=${THREAD_ID}`
    const screen = await render(<App />)

    await expect
      .element(screen.getByText(`thread ${THREAD_ID}`))
      .toBeInTheDocument()
  })
})
