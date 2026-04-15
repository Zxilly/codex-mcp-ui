import type { ReadonlyAssistantThread } from "@/lib/assistant-projection"
import type { EventRecord, Session } from "@/lib/types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fixtureClientSource, fixtureSession } from "@/lib/fixtures"
import { LiveSessionWorkbench } from "./session-workbench"

const sourceAlpha = fixtureClientSource
const sourceBeta = {
  ...fixtureClientSource,
  source_key: "codex-cli-991",
  client_name: "Codex CLI",
  pid: 991,
  executable: "C:/Tools/codex.exe",
  cwd: "C:/Users/demo/project",
}

const sessionAlpha: Session = {
  ...fixtureSession,
  thread_id: "thread-alpha",
  title: "Alpha incident",
}

const sessionBeta: Session = {
  ...fixtureSession,
  thread_id: "thread-beta",
  source_key: sourceBeta.source_key,
  title: "Beta rollout",
  approval_policy: "never",
  sandbox: "read-only",
  status: "idle",
}

let currentHashThreadId: string | null = null
let currentSetHashThreadId = vi.fn<(threadId: string | null) => void>()
let currentHistoryForThread = (threadId: string | null) => ({
  events: threadId === sessionBeta.thread_id
    ? [makeEvent(sessionBeta.thread_id, sourceBeta.source_key, "Beta rollout is stable")]
    : [makeEvent(sessionAlpha.thread_id, sourceAlpha.source_key, "Alpha summary ready")],
  status: "ready" as const,
  error: null,
  refreshKey: 1,
})

function readHashThreadId(): [string | null, (next: string | null) => void] {
  return [currentHashThreadId, currentSetHashThreadId]
}

function readSessionHistory(threadId: string | null) {
  return currentHistoryForThread(threadId)
}

function ReadonlyAssistantThreadComponent({
  thread,
}: {
  thread: ReadonlyAssistantThread | null
}) {
  const firstPart = thread?.messages[0]?.parts[0]
  return <div>{firstPart && "text" in firstPart ? firstPart.text : ""}</div>
}

function makeEvent(threadId: string, sourceKey: string, message: string): EventRecord {
  return {
    event_id: `evt-${threadId}`,
    timestamp: "2026-04-12T12:00:07Z",
    proxy_instance_id: "proxy-1",
    source_key: sourceKey,
    thread_id: threadId,
    request_id: `req-${threadId}`,
    turn_id: `turn-${threadId}`,
    direction: "codex_to_upstream",
    category: "codex_event",
    event_type: "agent_message",
    payload: {
      params: {
        msg: {
          type: "agent_message",
          message,
        },
      },
    },
  }
}

function renderLiveWorkbench(
  hashThreadId: string | null,
  options: {
    apiOverrides?: Record<string, unknown>
    sessionDetailRefetchIntervalMs?: number
  } = {},
) {
  currentHashThreadId = hashThreadId
  currentSetHashThreadId = vi.fn<(threadId: string | null) => void>()
  currentHistoryForThread = (threadId: string | null) => ({
    events: threadId === sessionBeta.thread_id
      ? [makeEvent(sessionBeta.thread_id, sourceBeta.source_key, "Beta rollout is stable")]
      : [makeEvent(sessionAlpha.thread_id, sourceAlpha.source_key, "Alpha summary ready")],
    status: "ready",
    error: null,
    refreshKey: 1,
  })
  const sessionSpy = vi.fn(async (threadId: string) => ({
    session: threadId === sessionBeta.thread_id ? sessionBeta : sessionAlpha,
    client_source: threadId === sessionBeta.thread_id ? sourceBeta : sourceAlpha,
    recent_events: [],
  }))
  const apiClient = {
    clientSources: async () => [sourceAlpha, sourceBeta],
    sessionsForSource: async (sourceKey: string) => {
      if (sourceKey === sourceBeta.source_key)
        return [sessionBeta]
      return [sessionAlpha]
    },
    session: sessionSpy,
    eventsPage: async () => ({ items: [], next_cursor: undefined }),
    events: async () => [],
    ...options.apiOverrides,
  }
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <LiveSessionWorkbench
        dependencies={{
          api: apiClient,
          useHashThreadId: readHashThreadId,
          sessionDetailRefetchIntervalMs: options.sessionDetailRefetchIntervalMs ?? 15_000,
          workbenchDependencies: {
            useSessionHistory: readSessionHistory,
            projectReadonlyAssistantThread: (sessionDetail): ReadonlyAssistantThread => ({
              header: {
                title: sessionDetail.session.title ?? sessionDetail.session.thread_id,
                subtitle: sessionDetail.session.thread_id,
                badges: [],
                threadId: sessionDetail.session.thread_id,
                clientName: sessionDetail.client_source.client_name,
                clientPid: sessionDetail.client_source.pid,
                firstSeen: sessionDetail.session.first_seen,
                lastSeen: sessionDetail.session.last_seen,
              },
              messages: [{
                id: `message-${sessionDetail.session.thread_id}`,
                role: "assistant",
                createdAt: sessionDetail.session.first_seen,
                parts: [{
                  type: "text",
                  text: sessionDetail.session.thread_id === sessionBeta.thread_id
                    ? "Beta rollout is stable"
                    : "Alpha summary ready",
                  eventIds: [`evt-${sessionDetail.session.thread_id}`],
                }],
              }],
            }),
            ReadonlyAssistantThreadComponent,
          },
        }}
      />
    </QueryClientProvider>,
  )

  return {
    apiClient,
    sessionSpy,
    setHashThreadId: currentSetHashThreadId,
  }
}

describe("liveSessionWorkbench", () => {
  it("preserves a valid hash and queries that selected session", async () => {
    const { sessionSpy, setHashThreadId } = renderLiveWorkbench(sessionBeta.thread_id)

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledWith(sessionBeta.thread_id)
    })

    expect(screen.getByText("Beta rollout is stable")).toBeInTheDocument()
    expect(setHashThreadId).not.toHaveBeenCalled()
  })

  it("falls back from a stale hash to the first available session before querying details", async () => {
    const { sessionSpy, setHashThreadId } = renderLiveWorkbench("thread-missing")

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledWith(sessionAlpha.thread_id)
    })

    expect(screen.getByText("Alpha summary ready")).toBeInTheDocument()
    expect(sessionSpy).not.toHaveBeenCalledWith("thread-missing")
    expect(setHashThreadId).toHaveBeenCalledWith(sessionAlpha.thread_id)
  })

  it("refreshes selected session detail so header metadata updates after the initial load", async () => {
    let detailRevision = 0
    const refreshedSession: Session = {
      ...sessionAlpha,
      model: "gpt-5.5",
      approval_policy: "never",
      status: "completed",
    }

    const sessionSpy = vi.fn(async () => {
      detailRevision += 1
      return {
        session: detailRevision === 1 ? sessionAlpha : refreshedSession,
        client_source: sourceAlpha,
        recent_events: [],
      }
    })

    renderLiveWorkbench(sessionAlpha.thread_id, {
      apiOverrides: { session: sessionSpy },
      sessionDetailRefetchIntervalMs: 20,
    })

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText("active")).toBeInTheDocument()

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(screen.getByText("completed")).toBeInTheDocument()
    })
    expect(screen.getByText("gpt-5.5")).toBeInTheDocument()
  })

  it("exposes a retry path when selected session detail fails and recovers after retry", async () => {
    const user = userEvent.setup()
    let attempts = 0
    const recoveredSession: Session = {
      ...sessionAlpha,
      model: "gpt-5.5",
      status: "completed",
    }

    const sessionSpy = vi.fn(async () => {
      attempts += 1
      if (attempts === 1)
        throw new Error("detail unavailable")

      return {
        session: recoveredSession,
        client_source: sourceAlpha,
        recent_events: [],
      }
    })

    renderLiveWorkbench(sessionAlpha.thread_id, {
      apiOverrides: { session: sessionSpy },
      sessionDetailRefetchIntervalMs: 60_000,
    })

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText("Alpha summary ready")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry session detail" })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Retry session detail" }))

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByText("completed")).toBeInTheDocument()
    })

    expect(screen.getByText("gpt-5.5")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retry session detail" })).toBeNull()
  })
})
