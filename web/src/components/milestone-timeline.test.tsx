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

  it("aggregates in-flight agent_message_delta frames per turn", () => {
    const deltas: EventRecord[] = [
      {
        event_id: "d1",
        timestamp: "2026-04-12T12:05:00Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        turn_id: "turn-stream",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "agent_message_delta",
        payload: { params: { msg: { type: "agent_message_delta", delta: "Hello " } } },
      },
      {
        event_id: "d2",
        timestamp: "2026-04-12T12:05:01Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        turn_id: "turn-stream",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "agent_message_delta",
        payload: { params: { msg: { type: "agent_message_delta", delta: "world" } } },
      },
    ]
    render(<MilestoneTimeline events={deltas} />)
    expect(screen.getByText(/streaming/i)).toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it("drops the streaming bucket when a terminal agent_message arrives", () => {
    const events: EventRecord[] = [
      {
        event_id: "d1",
        timestamp: "2026-04-12T12:05:00Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        turn_id: "turn-final",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "agent_message_delta",
        payload: { params: { msg: { type: "agent_message_delta", delta: "partial" } } },
      },
      {
        event_id: "fin",
        timestamp: "2026-04-12T12:05:02Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        turn_id: "turn-final",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "agent_message",
        payload: { params: { msg: { type: "agent_message", message: "final text" } } },
      },
    ]
    render(<MilestoneTimeline events={events} />)
    expect(screen.queryByText(/streaming/)).not.toBeInTheDocument()
    expect(screen.getByText(/final text/)).toBeInTheDocument()
  })

  it("renders agent_message markdown with inline code and lists", () => {
    const evt: EventRecord = {
      event_id: "am-1",
      timestamp: "2026-04-12T12:00:00Z",
      proxy_instance_id: "p1",
      source_key: "s1",
      thread_id: "t1",
      direction: "codex_to_upstream",
      category: "codex_event",
      event_type: "agent_message",
      payload: {
        params: {
          msg: {
            type: "agent_message",
            message: "Use the `hub.go` helper.\n\n- step one\n- step two",
          },
        },
      },
    }
    render(<MilestoneTimeline events={[evt]} />)
    // Inline code renders inside a <code>, not as literal backticks.
    expect(screen.getByText("hub.go").tagName.toLowerCase()).toBe("code")
    // List items are real <li> elements.
    expect(screen.getByText("step one").closest("li")).not.toBeNull()
    expect(screen.getByText("step two").closest("li")).not.toBeNull()
  })

  it("hides raw_response_item and other noise event types", () => {
    const noise: EventRecord[] = (
      [
        "raw_response_item",
        "thread_name_updated",
        "item_started",
        "item_completed",
        "hook_started",
        "collab_agent_spawn_begin",
        "realtime_conversation_started",
      ] as const
    ).map((type, i) => ({
      event_id: `n-${i}`,
      timestamp: `2026-04-12T12:0${i}:00Z`,
      proxy_instance_id: "p1",
      source_key: "s1",
      thread_id: "t1",
      direction: "codex_to_upstream",
      category: "codex_event",
      event_type: type,
      payload: { params: { msg: { type } } },
    }))
    render(<MilestoneTimeline events={noise} />)
    expect(screen.getByText(/Nothing recorded yet/i)).toBeInTheDocument()
  })

  it("renders error events inside an Alert with role=alert", () => {
    const evt: EventRecord = {
      event_id: "err-1",
      timestamp: "2026-04-12T12:00:00Z",
      proxy_instance_id: "p1",
      source_key: "s1",
      thread_id: "t1",
      direction: "codex_to_upstream",
      category: "codex_event",
      event_type: "error",
      payload: { params: { msg: { type: "error", message: "model timed out" } } },
    }
    render(<MilestoneTimeline events={[evt]} />)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Error")
    expect(alert).toHaveTextContent("model timed out")
  })

  it("aggregates web_search_begin and web_search_end into one milestone", () => {
    const events: EventRecord[] = [
      {
        event_id: "ws-1",
        timestamp: "2026-04-12T12:00:00Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "web_search_begin",
        payload: { params: { msg: { type: "web_search_begin", call_id: "ws-abc" } } },
      },
      {
        event_id: "ws-2",
        timestamp: "2026-04-12T12:00:02Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "web_search_end",
        payload: {
          params: {
            msg: {
              type: "web_search_end",
              call_id: "ws-abc",
              query: "codex mcp tool result schema",
              action: { type: "search" },
            },
          },
        },
      },
    ]
    render(<MilestoneTimeline events={events} />)
    expect(screen.getByText("Web search")).toBeInTheDocument()
    expect(screen.getByText("codex mcp tool result schema")).toBeInTheDocument()
  })

  it("renders patch_apply with file list and exit status", () => {
    const events: EventRecord[] = [
      {
        event_id: "p-1",
        timestamp: "2026-04-12T12:00:00Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "patch_apply_begin",
        payload: {
          params: {
            msg: {
              type: "patch_apply_begin",
              call_id: "p-abc",
              auto_approved: true,
              changes: { "src/a.ts": {}, "src/b.ts": {} },
            },
          },
        },
      },
      {
        event_id: "p-2",
        timestamp: "2026-04-12T12:00:02Z",
        proxy_instance_id: "p1",
        source_key: "s1",
        thread_id: "t1",
        direction: "codex_to_upstream",
        category: "codex_event",
        event_type: "patch_apply_end",
        payload: {
          params: {
            msg: {
              type: "patch_apply_end",
              call_id: "p-abc",
              success: true,
              stdout: "applied",
              stderr: "",
            },
          },
        },
      },
    ]
    render(<MilestoneTimeline events={events} />)
    expect(screen.getByText(/Patch apply \(2 files\)/)).toBeInTheDocument()
    expect(screen.getByText("src/a.ts")).toBeInTheDocument()
    expect(screen.getByText("applied")).toBeInTheDocument()
    expect(screen.getByText("auto-approved")).toBeInTheDocument()
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
