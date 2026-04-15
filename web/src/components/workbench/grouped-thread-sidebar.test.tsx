import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ClientSource, Session } from "@/lib/types"
import { GroupedThreadSidebar } from "./grouped-thread-sidebar"

const sources: ClientSource[] = [
  {
    source_key: "desktop-1",
    client_name: "Claude Desktop",
    pid: 18244,
    first_seen: "2026-04-13T10:00:00Z",
    last_seen: "2026-04-13T10:05:00Z",
    session_count: 2,
  },
  {
    source_key: "cli-1",
    client_name: "Codex CLI",
    pid: 999,
    first_seen: "2026-04-13T10:00:00Z",
    last_seen: "2026-04-13T10:05:00Z",
    session_count: 0,
  },
]

const sessionsBySource: Record<string, Session[]> = {
  "desktop-1": [
    {
      thread_id: "thread-1",
      source_key: "desktop-1",
      title: "Investigate coverage",
      first_seen: "2026-04-13T10:00:00Z",
      last_seen: "2026-04-13T10:05:00Z",
    },
    {
      thread_id: "thread-2",
      source_key: "desktop-1",
      title: "   ",
      first_seen: "2026-04-13T10:00:00Z",
      last_seen: "2026-04-13T10:05:00Z",
    },
  ],
  "cli-1": [],
}

describe("groupedThreadSidebar", () => {
  it("shows an empty registration state when no sources exist", () => {
    render(
      <GroupedThreadSidebar
        sources={[]}
        sessionsBySource={{}}
        selectedThreadId={null}
        onSelectThreadId={() => {}}
      />,
    )

    expect(screen.getByText("Waiting for registrations...")).toBeInTheDocument()
  })

  it("renders grouped sessions, fallback labels, empty groups, and selection callbacks", () => {
    const onSelectThreadId = vi.fn()

    render(
      <GroupedThreadSidebar
        sources={sources}
        sessionsBySource={sessionsBySource}
        selectedThreadId="thread-1"
        onSelectThreadId={onSelectThreadId}
      />,
    )

    expect(screen.getByText("Claude Desktop | pid 18244")).toBeInTheDocument()
    expect(screen.getByText("Codex CLI | pid 999")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Investigate coverage/i })).toHaveClass("bg-accent")
    expect(screen.getByRole("button", { name: /thread-2/ })).toBeInTheDocument()
    expect(screen.getByText("no sessions yet")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /thread-2/ }))
    expect(onSelectThreadId).toHaveBeenCalledWith("thread-2")
  })
})
