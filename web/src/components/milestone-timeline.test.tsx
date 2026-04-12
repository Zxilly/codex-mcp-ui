import type { EventRecord } from "@/lib/types"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fixtureEvents } from "@/lib/fixtures"
import { MilestoneTimeline } from "./milestone-timeline"

describe("milestoneTimeline", () => {
  it("shows an empty hint when there are no events", () => {
    render(<MilestoneTimeline events={[]} />)
    expect(screen.getByText(/Nothing recorded yet/i)).toBeInTheDocument()
  })

  it("groups exec_command_begin/output_delta/end into one block", () => {
    render(<MilestoneTimeline events={fixtureEvents} />)
    const execCard = screen.getByText(/Command cmd-1/i).closest("li")
    expect(execCard).not.toBeNull()
    const scope = within(execCard as HTMLElement)
    expect(scope.getByText(/file1/)).toBeInTheDocument()
    expect(scope.getByText(/exit=0/)).toBeInTheDocument()
  })

  it("renders turn_complete and session_configured milestones", () => {
    render(<MilestoneTimeline events={fixtureEvents} />)
    expect(screen.getAllByText(/Session configured/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Turn complete/)).toBeInTheDocument()
  })

  it("annotates tools/call with the tool name", () => {
    const toolCall: EventRecord = {
      event_id: "evt-tool",
      timestamp: "2026-04-12T12:03:00Z",
      proxy_instance_id: "proxy-1",
      source_key: "s1",
      thread_id: "t1",
      direction: "upstream_to_codex",
      category: "jsonrpc_request",
      event_type: "tools/call",
      payload: { params: { name: "search_web", arguments: { q: "x" } } },
    }
    render(<MilestoneTimeline events={[toolCall]} />)
    expect(screen.getByText(/tools\/call: search_web/)).toBeInTheDocument()
  })

  it("falls back to a generic milestone for unknown event types", () => {
    const unknown: EventRecord = {
      event_id: "evt-unknown",
      timestamp: "2026-04-12T12:03:30Z",
      proxy_instance_id: "proxy-1",
      source_key: "s1",
      thread_id: "t1",
      direction: "codex_to_upstream",
      category: "codex_event",
      event_type: "custom_extension_event",
      payload: { hello: "world" },
    }
    render(<MilestoneTimeline events={[unknown]} />)
    expect(screen.getByText("custom_extension_event")).toBeInTheDocument()
  })

  it("skips raw_frame and response noise", () => {
    const noise: EventRecord[] = [
      {
        event_id: "evt-raw",
        timestamp: "2026-04-12T12:03:45Z",
        proxy_instance_id: "proxy-1",
        source_key: "s1",
        thread_id: "t1",
        direction: "codex_to_upstream",
        category: "raw_frame",
        event_type: "raw_frame",
        payload: "garbage",
      },
      {
        event_id: "evt-resp",
        timestamp: "2026-04-12T12:03:46Z",
        proxy_instance_id: "proxy-1",
        source_key: "s1",
        thread_id: "t1",
        direction: "codex_to_upstream",
        category: "response",
        event_type: "response",
        payload: { result: {} },
      },
    ]
    render(<MilestoneTimeline events={noise} />)
    expect(screen.getByText(/Nothing recorded yet/i)).toBeInTheDocument()
  })

  it("surfaces approval requests under an Approval: prefix", () => {
    const approval: EventRecord = {
      event_id: "evt-approval",
      timestamp: "2026-04-12T12:02:00Z",
      proxy_instance_id: "proxy-1",
      source_key: "s1",
      thread_id: "t1",
      direction: "codex_to_upstream",
      category: "codex_event",
      event_type: "exec_approval_request",
      payload: { reason: "needs root" },
    }
    render(<MilestoneTimeline events={[approval]} />)
    expect(screen.getByText(/Approval: exec_approval_request/)).toBeInTheDocument()
  })
})
