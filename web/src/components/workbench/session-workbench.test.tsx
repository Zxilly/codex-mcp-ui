import type { ReadonlyAssistantThread as ReadonlyAssistantThreadProjection } from "@/lib/assistant-projection"
import type { EventRecord, Session, SessionDetail } from "@/lib/types"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fixtureClientSource, fixtureSession } from "@/lib/fixtures"
import { SessionWorkbench } from "./session-workbench"

function makeSession(overrides: Partial<Session>): Session {
  return {
    ...fixtureSession,
    ...overrides,
  }
}

function makeSessionDetail(
  session: Session,
  recentEvents: EventRecord[] = [],
): SessionDetail {
  return {
    session,
    client_source: fixtureClientSource,
    recent_events: recentEvents,
  }
}

function makeEvent(
  eventId: string,
  timestamp: string,
  eventType: string,
  message: string,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    event_id: eventId,
    timestamp,
    proxy_instance_id: "proxy-1",
    source_key: fixtureClientSource.source_key,
    thread_id: fixtureSession.thread_id,
    request_id: "req-1",
    turn_id: "turn-1",
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
    ...overrides,
  }
}

function ReadonlyAssistantThreadStub({
  thread,
}: {
  thread: ReadonlyAssistantThreadProjection | null
}) {
  return (
    <div>
      {thread?.messages.map(message => (
        <div key={message.id}>
          {message.parts.map(part => (
            <span
              key={`${message.id}-${"text" in part ? `${part.type}-${part.text}` : `${part.type}-${part.title}`}`}
            >
              {"text" in part ? part.text : part.type}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

describe("sessionWorkbench", () => {
  it("defaults to Conversation and mounts no composer/send UI", () => {
    const session = makeSession({ thread_id: "thread-1", title: "Thread 1" })
    const useSessionHistory = vi.fn(() => ({
      events: [
        makeEvent("evt-user", "2026-04-13T09:00:00Z", "user_message", "Summarize the run", {
          thread_id: "thread-1",
        }),
        makeEvent("evt-assistant", "2026-04-13T09:00:01Z", "agent_message", "Readonly reply", {
          thread_id: "thread-1",
        }),
      ],
      status: "ready" as const,
      error: null,
      refreshKey: 1,
    }))

    render(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [session] }}
        hashThreadId="thread-1"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(session)}
        dependencies={{ useSessionHistory }}
      />,
    )

    expect(screen.getByRole("tab", { name: "Conversation" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByText("Readonly reply")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull()
  })

  it("keeps Raw events and Metadata as thread-local tabs", async () => {
    const user = userEvent.setup()
    const session = makeSession({ thread_id: "thread-1", title: "Thread 1" })
    const useSessionHistory = vi.fn(() => ({
      events: [
        makeEvent("evt-user", "2026-04-13T09:00:00Z", "user_message", "Open the log", {
          thread_id: "thread-1",
        }),
      ],
      status: "ready" as const,
      error: null,
      refreshKey: 1,
    }))

    render(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [session] }}
        hashThreadId="thread-1"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(session)}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    await user.click(screen.getByRole("tab", { name: "Raw events" }))
    expect(screen.getByLabelText(/event type/i)).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Metadata" }))
    const panel = screen.getByText("Thread id").closest("div")
    expect(within(panel ?? document.body).getByText("thread-1")).toBeInTheDocument()
    expect(screen.queryByLabelText(/event type/i)).toBeNull()
  })

  it("renders conversation content from full history instead of recent events only", () => {
    const session = makeSession({ thread_id: "thread-1", title: "Thread 1" })
    const useSessionHistory = vi.fn(() => ({
      events: [
        makeEvent("evt-user-older", "2026-04-13T08:59:00Z", "user_message", "What changed?", {
          thread_id: "thread-1",
        }),
        makeEvent("evt-assistant-older", "2026-04-13T08:59:01Z", "agent_message", "Older paged reply", {
          thread_id: "thread-1",
        }),
        makeEvent("evt-assistant-recent", "2026-04-13T09:00:01Z", "agent_message", "Recent reply", {
          thread_id: "thread-1",
        }),
      ],
      status: "ready" as const,
      error: null,
      refreshKey: 2,
    }))

    render(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [session] }}
        hashThreadId="thread-1"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(session, [
          makeEvent("evt-assistant-recent", "2026-04-13T09:00:01Z", "agent_message", "Recent reply", {
            thread_id: "thread-1",
          }),
        ])}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    expect(screen.getByText("Older paged reply")).toBeInTheDocument()
    expect(screen.getByText("Recent reply")).toBeInTheDocument()
  })

  it("resets the selected tab to Conversation when the selected thread changes", async () => {
    const user = userEvent.setup()
    const sessionOne = makeSession({ thread_id: "thread-1", title: "Thread 1" })
    const sessionTwo = makeSession({
      thread_id: "thread-2",
      title: "Thread 2",
      first_seen: "2026-04-13T10:00:00Z",
      last_seen: "2026-04-13T10:05:00Z",
    })
    const useSessionHistory = vi.fn((threadId: string | null) => ({
      events: threadId === "thread-2"
        ? [
            makeEvent("evt-thread-2", "2026-04-13T10:00:01Z", "agent_message", "Thread 2 reply", {
              thread_id: "thread-2",
            }),
          ]
        : [
            makeEvent("evt-thread-1", "2026-04-13T09:00:01Z", "agent_message", "Thread 1 reply", {
              thread_id: "thread-1",
            }),
          ],
      status: "ready" as const,
      error: null,
      refreshKey: threadId === "thread-2" ? 2 : 1,
    }))

    const { rerender } = render(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [sessionOne, sessionTwo] }}
        hashThreadId="thread-1"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(sessionOne)}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    await user.click(screen.getByRole("tab", { name: "Raw events" }))
    expect(screen.getByLabelText(/event type/i)).toBeInTheDocument()

    rerender(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [sessionOne, sessionTwo] }}
        hashThreadId="thread-2"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(sessionTwo)}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    expect(screen.getByRole("tab", { name: "Conversation" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByText("Thread 2 reply")).toBeInTheDocument()
    expect(screen.queryByLabelText(/event type/i)).toBeNull()
  })

  it("keeps conversation content available when thread history is ready but sessionDetail is stale", () => {
    const sessionOne = makeSession({ thread_id: "thread-1", title: "Thread 1" })
    const sessionTwo = makeSession({
      thread_id: "thread-2",
      title: "Thread 2",
      first_seen: "2026-04-13T10:00:00Z",
      last_seen: "2026-04-13T10:05:00Z",
    })
    const useSessionHistory = vi.fn((threadId: string | null) => ({
      events: threadId === "thread-2"
        ? [
            makeEvent("evt-thread-2", "2026-04-13T10:00:01Z", "agent_message", "Thread 2 reply", {
              thread_id: "thread-2",
            }),
          ]
        : [],
      status: "ready" as const,
      error: null,
      refreshKey: 1,
    }))

    render(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [sessionOne, sessionTwo] }}
        hashThreadId="thread-2"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(sessionOne)}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    expect(screen.getByText("Thread 2 reply")).toBeInTheDocument()
  })

  it("resets raw event filters and expanded rows when the selected thread changes", async () => {
    const user = userEvent.setup()
    const sessionOne = makeSession({ thread_id: "thread-1", title: "Thread 1" })
    const sessionTwo = makeSession({
      thread_id: "thread-2",
      title: "Thread 2",
      first_seen: "2026-04-13T10:00:00Z",
      last_seen: "2026-04-13T10:05:00Z",
    })
    const threadOneEvents = [
      makeEvent("evt-thread-1-user", "2026-04-13T09:00:00Z", "user_message", "Thread 1 user", {
        thread_id: "thread-1",
      }),
      makeEvent("evt-thread-1-agent", "2026-04-13T09:00:01Z", "agent_message", "Thread 1 reply", {
        thread_id: "thread-1",
      }),
    ]
    const threadTwoEvents = [
      makeEvent("evt-thread-2-agent", "2026-04-13T10:00:01Z", "agent_message", "Thread 2 reply", {
        thread_id: "thread-2",
      }),
    ]
    const useSessionHistory = vi.fn((threadId: string | null) => ({
      events: threadId === "thread-2" ? threadTwoEvents : threadOneEvents,
      status: "ready" as const,
      error: null,
      refreshKey: threadId === "thread-2" ? 2 : 1,
    }))

    const { rerender } = render(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [sessionOne, sessionTwo] }}
        hashThreadId="thread-1"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(sessionOne)}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    await user.click(screen.getByRole("tab", { name: "Raw events" }))
    await user.type(screen.getByLabelText(/event type/i), "user_message")
    const bodyRows = screen
      .getAllByRole("row")
      .filter(row => row.querySelector("td"))
    await user.click(bodyRows[0]!)
    expect(screen.getByTestId("raw-expand-evt-thread-1-user")).toBeInTheDocument()

    rerender(
      <SessionWorkbench
        sources={[fixtureClientSource]}
        sessionsBySource={{ [fixtureClientSource.source_key]: [sessionOne, sessionTwo] }}
        hashThreadId="thread-2"
        onSelectThreadId={() => {}}
        sessionDetail={makeSessionDetail(sessionTwo)}
        dependencies={{
          useSessionHistory,
          ReadonlyAssistantThreadComponent: ReadonlyAssistantThreadStub,
        }}
      />,
    )

    await user.click(screen.getByRole("tab", { name: "Raw events" }))
    expect(screen.getByLabelText(/event type/i)).toHaveValue("")
    expect(screen.queryByTestId("raw-expand-evt-thread-1-user")).toBeNull()
    expect(screen.getByText("agent_message")).toBeInTheDocument()
  })
})
