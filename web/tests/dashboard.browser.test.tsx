import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import App from "@/App"
import { queryClient } from "@/lib/query-client"

interface ReadonlyThreadStubProps {
  thread: {
    messages?: Array<{
      id: string
      parts: Array<{ type: string, text?: string }>
    }>
  } | null
  error: Error | null
  status: string
}

function ReadonlyAssistantThreadStub({
  thread,
  error,
  status,
}: ReadonlyThreadStubProps) {
  return (
    <div data-testid="readonly-thread-stub">
      <div>{status}</div>
      {error && <div>{error.message}</div>}
      {thread?.messages?.map(message => (
        <div key={message.id}>
          {message.parts.map((part, index) => (
            <span key={`${message.id}-${part.type}-${part.text ?? index}`}>
              {part.type === "text" ? part.text : part.type}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

vi.mock("@/components/workbench/readonly-assistant-thread", () => ({
  ReadonlyAssistantThread: ReadonlyAssistantThreadStub,
}))

const SOURCE_ALPHA = "claude-desktop-18244"
const SOURCE_BETA = "codex-cli-991"
const THREAD_ALPHA = "thread-alpha"
const THREAD_BETA = "thread-beta"

const clientSources = [
  {
    source_key: SOURCE_ALPHA,
    client_name: "Claude Desktop",
    pid: 18244,
    protocol_version: "2024-11-05",
    executable: "C:/Program Files/Claude/Claude.exe",
    cwd: "C:/Users/demo",
    first_seen: "2026-04-12T12:00:00Z",
    last_seen: "2026-04-12T12:05:00Z",
    session_count: 1,
  },
  {
    source_key: SOURCE_BETA,
    client_name: "Codex CLI",
    pid: 991,
    protocol_version: "2024-11-05",
    executable: "C:/Tools/codex.exe",
    cwd: "C:/Users/demo/project",
    first_seen: "2026-04-12T12:10:00Z",
    last_seen: "2026-04-12T12:15:00Z",
    session_count: 1,
  },
]

const sessionsBySource = {
  [SOURCE_ALPHA]: [
    {
      thread_id: THREAD_ALPHA,
      source_key: SOURCE_ALPHA,
      title: "Alpha incident",
      model: "gpt-5.4",
      cwd: "C:/Users/demo/project-alpha",
      approval_policy: "on-request",
      sandbox: "workspace-write",
      first_seen: "2026-04-12T12:00:05Z",
      last_seen: "2026-04-12T12:04:59Z",
      status: "active",
    },
  ],
  [SOURCE_BETA]: [
    {
      thread_id: THREAD_BETA,
      source_key: SOURCE_BETA,
      title: "Beta rollout",
      model: "gpt-5.4",
      cwd: "C:/Users/demo/project-beta",
      approval_policy: "never",
      sandbox: "read-only",
      first_seen: "2026-04-12T12:10:05Z",
      last_seen: "2026-04-12T12:14:59Z",
      status: "idle",
    },
  ],
} satisfies Record<string, Array<Record<string, unknown>>>

const eventsByThread = {
  [THREAD_ALPHA]: [
    makeEvent("evt-alpha-user", THREAD_ALPHA, SOURCE_ALPHA, "2026-04-12T12:00:06Z", "user_message", "Summarize the alpha incident"),
    makeEvent("evt-alpha-assistant", THREAD_ALPHA, SOURCE_ALPHA, "2026-04-12T12:00:07Z", "agent_message", "Alpha summary ready"),
  ],
  [THREAD_BETA]: [
    makeEvent("evt-beta-user", THREAD_BETA, SOURCE_BETA, "2026-04-12T12:10:06Z", "user_message", "Show the rollout status"),
    makeEvent("evt-beta-assistant", THREAD_BETA, SOURCE_BETA, "2026-04-12T12:10:07Z", "agent_message", "Beta rollout is stable"),
  ],
} satisfies Record<string, ReturnType<typeof makeEvent>[]>

function makeEvent(
  eventId: string,
  threadId: string,
  sourceKey: string,
  timestamp: string,
  eventType: string,
  message: string,
) {
  return {
    event_id: eventId,
    timestamp,
    proxy_instance_id: "proxy-1",
    source_key: sourceKey,
    thread_id: threadId,
    request_id: `req-${eventId}`,
    turn_id: `turn-${threadId}`,
    direction: "codex_to_upstream",
    category: "codex_event",
    event_type: eventType,
    payload: {
      params: {
        msg: {
          type: eventType,
          message,
        },
      },
    },
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

function installFetchStub() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.endsWith("/api/v1/client-sources"))
      return jsonResponse({ items: clientSources })

    if (url.endsWith(`/api/v1/client-sources/${SOURCE_ALPHA}/sessions`))
      return jsonResponse({ items: sessionsBySource[SOURCE_ALPHA] })

    if (url.endsWith(`/api/v1/client-sources/${SOURCE_BETA}/sessions`))
      return jsonResponse({ items: sessionsBySource[SOURCE_BETA] })

    if (url.endsWith(`/api/v1/sessions/${THREAD_ALPHA}`)) {
      return jsonResponse({
        session: sessionsBySource[SOURCE_ALPHA][0],
        client_source: clientSources[0],
        recent_events: eventsByThread[THREAD_ALPHA],
      })
    }

    if (url.endsWith(`/api/v1/sessions/${THREAD_BETA}`)) {
      return jsonResponse({
        session: sessionsBySource[SOURCE_BETA][0],
        client_source: clientSources[1],
        recent_events: eventsByThread[THREAD_BETA],
      })
    }

    if (url.includes(`/api/v1/sessions/${THREAD_ALPHA}/events`)) {
      return jsonResponse({ items: eventsByThread[THREAD_ALPHA], next_cursor: null })
    }

    if (url.includes(`/api/v1/sessions/${THREAD_BETA}/events`)) {
      return jsonResponse({ items: eventsByThread[THREAD_BETA], next_cursor: null })
    }

    if (url.includes("/api/v1/stream")) {
      return new Response("", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    }

    return jsonResponse({ error: "not found" }, { status: 404 })
  })

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("dashboard (browser e2e)", () => {
  beforeEach(() => {
    queryClient.clear()
    vi.unstubAllGlobals()
    window.location.hash = ""
  })

  it("renders the grouped conversation-first workbench with thread-local tabs", async () => {
    installFetchStub()
    const screen = await render(<App />)

    await expect
      .element(screen.getByText("Claude Desktop | pid 18244").first())
      .toBeInTheDocument()

    await expect
      .element(screen.getByText("Codex CLI | pid 991").first())
      .toBeInTheDocument()

    await expect
      .element(screen.getByRole("tab", { name: "Conversation" }))
      .toHaveAttribute("aria-selected", "true")

    await expect
      .element(screen.getByRole("tab", { name: "Raw events" }))
      .toBeInTheDocument()

    await expect
      .element(screen.getByRole("tab", { name: "Metadata" }))
      .toBeInTheDocument()

    await expect
      .element(screen.getByText("Alpha summary ready"))
      .toBeInTheDocument()
  })

  it("switches between Raw events and Metadata for the selected thread", async () => {
    installFetchStub()
    const screen = await render(<App />)

    await screen.getByRole("tab", { name: "Raw events" }).click()

    await expect
      .element(screen.getByLabelText("event type"))
      .toBeInTheDocument()

    await screen.getByRole("tab", { name: "Metadata" }).click()

    await expect
      .element(screen.getByText("Thread id"))
      .toBeInTheDocument()

    await expect
      .element(screen.getByText("Approval policy"))
      .toBeInTheDocument()
  })

  it("deep-links to a valid session hash and preserves that selection", async () => {
    const fetchMock = installFetchStub()
    window.location.hash = `#thread=${THREAD_BETA}`
    const screen = await render(<App />)

    await expect
      .element(screen.getByRole("heading", { name: "Beta rollout" }))
      .toBeInTheDocument()

    await expect
      .element(screen.getByText("Beta rollout is stable"))
      .toBeInTheDocument()

    expect(window.location.hash).toBe(`#thread=${THREAD_BETA}`)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/sessions/${THREAD_BETA}`),
      expect.anything(),
    )
  })

  it("falls back from a stale hash to the first available session and rewrites the URL hash", async () => {
    const fetchMock = installFetchStub()
    window.location.hash = "#thread=thread-missing"
    const screen = await render(<App />)

    await expect
      .element(screen.getByRole("heading", { name: "Alpha incident" }))
      .toBeInTheDocument()

    await expect
      .element(screen.getByText("Alpha summary ready"))
      .toBeInTheDocument()

    expect(window.location.hash).toBe(`#thread=${THREAD_ALPHA}`)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/sessions/thread-missing"),
      expect.anything(),
    )
  })
})
