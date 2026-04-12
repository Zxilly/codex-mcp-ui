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
