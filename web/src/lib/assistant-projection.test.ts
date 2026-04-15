import type { EventRecord, SessionDetail } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { projectReadonlyAssistantThread } from "./assistant-projection"
import { fixtureClientSource, fixtureSession } from "./fixtures"

function makeSessionDetail(overrides?: Partial<SessionDetail["session"]>): SessionDetail {
  return {
    session: {
      ...fixtureSession,
      title: "Readonly thread",
      model: "gpt-5.4",
      status: "active",
      approval_policy: "on-request",
      sandbox: "workspace-write",
      ...overrides,
    },
    client_source: fixtureClientSource,
    recent_events: [],
  }
}

function makeEvent(
  event_type: string,
  timestamp: string,
  payload: unknown,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    event_id: `${event_type}-${timestamp}`,
    timestamp,
    proxy_instance_id: "proxy-1",
    source_key: fixtureClientSource.source_key,
    thread_id: fixtureSession.thread_id,
    direction: "codex_to_upstream",
    category: "codex_event",
    event_type,
    payload,
    ...overrides,
  }
}

describe("projectReadonlyAssistantThread", () => {
  it("projects user, assistant, reasoning, and tool events into readonly thread parts", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("user_message", "2026-04-13T10:00:00Z", {
        params: { msg: { type: "user_message", message: "Summarize the logs." } },
      }),
      makeEvent("agent_reasoning", "2026-04-13T10:00:01Z", {
        params: { msg: { type: "agent_reasoning", text: "Checking the recent failures first." } },
      }),
      makeEvent("exec_command_begin", "2026-04-13T10:00:02Z", {
        params: {
          msg: {
            type: "exec_command_begin",
            call_id: "exec-1",
            command: ["git", "status", "--short"],
            cwd: "E:/Project/CS_Project/2026/codex-mcp-ui",
          },
        },
      }, { command_call_id: "exec-1" }),
      makeEvent("exec_command_output_delta", "2026-04-13T10:00:03Z", {
        params: {
          msg: {
            type: "exec_command_output_delta",
            call_id: "exec-1",
            chunk: "TSAgd2ViL3NyYy9saWIvZml4dHVyZXMudHMK",
          },
        },
      }, { command_call_id: "exec-1" }),
      makeEvent("exec_command_end", "2026-04-13T10:00:04Z", {
        params: {
          msg: {
            type: "exec_command_end",
            call_id: "exec-1",
            exit_code: 0,
          },
        },
      }, { command_call_id: "exec-1" }),
      makeEvent("mcp_tool_call_begin", "2026-04-13T10:00:05Z", {
        params: {
          msg: {
            type: "mcp_tool_call_begin",
            call_id: "mcp-1",
            invocation: {
              server: "filesystem",
              tool: "read_file",
              arguments: { path: "/tmp/log.txt" },
            },
          },
        },
      }, { tool_call_id: "mcp-1" }),
      makeEvent("mcp_tool_call_end", "2026-04-13T10:00:06Z", {
        params: {
          msg: {
            type: "mcp_tool_call_end",
            call_id: "mcp-1",
            duration: "24ms",
            invocation: {
              server: "filesystem",
              tool: "read_file",
              arguments: { path: "/tmp/log.txt" },
            },
            result: {
              Ok: {
                content: [{ type: "text", text: "all good" }],
                structured_content: { path: "/tmp/log.txt" },
                is_error: false,
              },
            },
          },
        },
      }, { tool_call_id: "mcp-1" }),
      makeEvent("agent_message", "2026-04-13T10:00:07Z", {
        params: { msg: { type: "agent_message", message: "Everything looks clean." } },
      }),
    ])

    expect(thread.header.title).toBe("Readonly thread")
    expect(thread.messages).toHaveLength(2)
    expect(thread.messages[0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Summarize the logs." }],
    })
    expect(thread.messages[1]?.role).toBe("assistant")
    expect(thread.messages[1]?.parts).toEqual([
      {
        type: "reasoning",
        text: "Checking the recent failures first.",
        variant: "reasoning",
        eventIds: ["agent_reasoning-2026-04-13T10:00:01Z"],
      },
      {
        type: "tool",
        toolKind: "exec_command",
        title: "git status --short",
        status: "complete",
        command: ["git", "status", "--short"],
        cwd: "E:/Project/CS_Project/2026/codex-mcp-ui",
        output: "M  web/src/lib/fixtures.ts\n",
        exitCode: 0,
        eventIds: [
          "exec_command_begin-2026-04-13T10:00:02Z",
          "exec_command_output_delta-2026-04-13T10:00:03Z",
          "exec_command_end-2026-04-13T10:00:04Z",
        ],
      },
      {
        type: "tool",
        toolKind: "mcp_tool_call",
        title: "filesystem.read_file",
        status: "complete",
        server: "filesystem",
        toolName: "read_file",
        args: { path: "/tmp/log.txt" },
        result: {
          Ok: {
            content: [{ type: "text", text: "all good" }],
            structured_content: { path: "/tmp/log.txt" },
            is_error: false,
          },
        },
        duration: "24ms",
        eventIds: [
          "mcp_tool_call_begin-2026-04-13T10:00:05Z",
          "mcp_tool_call_end-2026-04-13T10:00:06Z",
        ],
      },
      {
        type: "text",
        text: "Everything looks clean.",
        eventIds: ["agent_message-2026-04-13T10:00:07Z"],
      },
    ])
  })

  it("preserves structured user inputs from the real user_message payload shape", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("user_message", "2026-04-13T10:00:00Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "user_message",
            message: "Check these inputs",
            images: ["https://example.com/diagram.png"],
            local_images: ["C:/tmp/local.png"],
            text_elements: [{ kind: "mention", start: 0, end: 5, text: "@repo" }],
          },
        },
      }),
    ])

    expect(thread.messages).toMatchObject([
      {
        id: "user-user_message-2026-04-13T10:00:00Z",
        role: "user",
        createdAt: "2026-04-13T10:00:00Z",
        parts: [
          {
            type: "text",
            text: "Check these inputs",
            eventIds: ["user_message-2026-04-13T10:00:00Z"],
          },
          {
            type: "unknown",
            eventType: "user_inputs",
            title: "User inputs",
            payload: {
              images: ["https://example.com/diagram.png"],
              local_images: ["C:/tmp/local.png"],
              text_elements: [{ kind: "mention", start: 0, end: 5, text: "@repo" }],
            },
            eventIds: ["user_message-2026-04-13T10:00:00Z"],
          },
        ],
      },
    ])
  })

  it("updates header metadata even when the event array is unchanged", () => {
    const events = [
      makeEvent("agent_message", "2026-04-13T10:01:00Z", {
        params: { msg: { type: "agent_message", message: "Snapshot ready." } },
      }),
    ]
    const first = projectReadonlyAssistantThread(makeSessionDetail({
      title: "Original title",
      model: "gpt-5.4",
      status: "active",
    }), events)
    const second = projectReadonlyAssistantThread(makeSessionDetail({
      title: "Renamed thread",
      model: "gpt-5.5",
      status: "idle",
    }), events)

    expect(first.messages).toEqual(second.messages)
    expect(first.header).toMatchObject({
      title: "Original title",
      badges: ["gpt-5.4", "active"],
    })
    expect(second.header).toMatchObject({
      title: "Renamed thread",
      badges: ["gpt-5.5", "idle"],
    })
  })

  it("falls back to a generated thread title when the session title is blank", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail({
      title: "   ",
      thread_id: "thread-fallback-title",
    }), [])

    expect(thread.header.title).toBe("thread thread-fallback-title")
    expect(thread.header.subtitle).toContain("thread-fallback-title")
  })

  it("keeps consecutive terminal assistant text events as separate messages", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("agent_message", "2026-04-13T10:01:00Z", {
        params: { msg: { type: "agent_message", message: "First reply." } },
      }),
      makeEvent("agent_message", "2026-04-13T10:01:01Z", {
        params: { msg: { type: "agent_message", message: "Second reply." } },
      }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-agent_message-2026-04-13T10:01:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:01:00Z",
        parts: [{
          type: "text",
          text: "First reply.",
          eventIds: ["agent_message-2026-04-13T10:01:00Z"],
        }],
      },
      {
        id: "assistant-agent_message-2026-04-13T10:01:01Z",
        role: "assistant",
        createdAt: "2026-04-13T10:01:01Z",
        parts: [{
          type: "text",
          text: "Second reply.",
          eventIds: ["agent_message-2026-04-13T10:01:01Z"],
        }],
      },
    ])
  })

  it("preserves lifecycle, plan, approval, image generation, mcp method, and unknown fallback parts", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("session_configured", "2026-04-13T10:02:00Z", {
        params: { msg: { type: "session_configured", model: "gpt-5.4", cwd: "C:/repo" } },
      }),
      makeEvent("plan_update", "2026-04-13T10:02:01Z", {
        params: {
          msg: {
            type: "plan_update",
            explanation: "Phase the work.",
            plan: [
              { step: "Add tests", status: "completed" },
              { step: "Wire runtime", status: "in_progress" },
            ],
          },
        },
      }),
      makeEvent("exec_approval_request", "2026-04-13T10:02:02Z", {
        params: {
          msg: {
            type: "exec_approval_request",
            reason: "Need elevated shell access.",
            command: ["pnpm", "install"],
            cwd: "C:/repo/web",
          },
        },
      }),
      makeEvent("image_generation_begin", "2026-04-13T10:02:03Z", {
        params: { msg: { type: "image_generation_begin", call_id: "img-1" } },
      }),
      makeEvent("image_generation_end", "2026-04-13T10:02:04Z", {
        params: { msg: { type: "image_generation_end", call_id: "img-1" } },
      }),
      makeEvent("tools/call", "2026-04-13T10:02:05Z", {
        params: { name: "search_web", arguments: { q: "assistant-ui runtime" } },
      }, {
        category: "jsonrpc_request",
        direction: "upstream_to_codex",
      }),
      makeEvent("custom_extension_event", "2026-04-13T10:02:06Z", {
        params: { msg: { type: "custom_extension_event", detail: "opaque" } },
      }),
    ])

    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]?.parts).toEqual([
      {
        type: "lifecycle",
        eventType: "session_configured",
        title: "Session configured",
        data: { model: "gpt-5.4", cwd: "C:/repo" },
        eventIds: ["session_configured-2026-04-13T10:02:00Z"],
      },
      {
        type: "plan",
        title: "Plan update",
        explanation: "Phase the work.",
        steps: [
          { step: "Add tests", status: "completed" },
          { step: "Wire runtime", status: "in_progress" },
        ],
        eventIds: ["plan_update-2026-04-13T10:02:01Z"],
      },
      {
        type: "approval",
        title: "Approval required",
        requestKind: "exec_approval_request",
        reason: "Need elevated shell access.",
        command: ["pnpm", "install"],
        cwd: "C:/repo/web",
        eventIds: ["exec_approval_request-2026-04-13T10:02:02Z"],
      },
      {
        type: "tool",
        toolKind: "image_generation",
        title: "Image generation",
        status: "complete",
        eventIds: [
          "image_generation_begin-2026-04-13T10:02:03Z",
          "image_generation_end-2026-04-13T10:02:04Z",
        ],
      },
      {
        type: "mcp_method",
        method: "tools/call",
        title: "tools/call: search_web",
        params: { name: "search_web", arguments: { q: "assistant-ui runtime" } },
        eventIds: ["tools/call-2026-04-13T10:02:05Z"],
      },
      {
        type: "unknown",
        eventType: "custom_extension_event",
        title: "custom_extension_event",
        payload: { params: { msg: { type: "custom_extension_event", detail: "opaque" } } },
        eventIds: ["custom_extension_event-2026-04-13T10:02:06Z"],
      },
    ])
  })

  it("projects dynamic tool, view image, and mcp startup families explicitly", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("dynamic_tool_call_request", "2026-04-13T10:02:00Z", {
        params: {
          msg: {
            type: "dynamic_tool_call_request",
            call_id: "dyn-1",
            tool: "open_url",
            arguments: { url: "https://assistant-ui.com/docs" },
          },
        },
      }),
      makeEvent("dynamic_tool_call_response", "2026-04-13T10:02:01Z", {
        params: {
          msg: {
            type: "dynamic_tool_call_response",
            call_id: "dyn-1",
            turn_id: "turn-1",
            tool: "open_url",
            success: true,
            duration: "12ms",
            arguments: { url: "https://assistant-ui.com/docs" },
            content_items: [{ type: "inputText", text: "opened" }],
            error: null,
          },
        },
      }),
      makeEvent("view_image_tool_call", "2026-04-13T10:02:02Z", {
        params: {
          msg: {
            type: "view_image_tool_call",
            call_id: "view-1",
            path: "E:/screenshots/failure.png",
          },
        },
      }),
      makeEvent("mcp_startup_update", "2026-04-13T10:02:03Z", {
        params: {
          msg: {
            type: "mcp_startup_update",
            server: "filesystem",
            status: { state: "ready" },
          },
        },
      }),
      makeEvent("mcp_startup_complete", "2026-04-13T10:02:04Z", {
        params: {
          msg: {
            type: "mcp_startup_complete",
            servers: ["filesystem"],
          },
        },
      }),
    ])

    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]?.parts).toEqual([
      {
        type: "tool",
        toolKind: "dynamic_tool_call",
        title: "Dynamic tool: open_url",
        status: "complete",
        toolName: "open_url",
        args: { url: "https://assistant-ui.com/docs" },
        result: [{ type: "inputText", text: "opened" }],
        duration: "12ms",
        eventIds: [
          "dynamic_tool_call_request-2026-04-13T10:02:00Z",
          "dynamic_tool_call_response-2026-04-13T10:02:01Z",
        ],
      },
      {
        type: "tool",
        toolKind: "view_image",
        title: "View image",
        args: { call_id: "view-1", path: "E:/screenshots/failure.png" },
        status: "complete",
        eventIds: ["view_image_tool_call-2026-04-13T10:02:02Z"],
      },
      {
        type: "lifecycle",
        eventType: "mcp_startup_update",
        title: "MCP startup update",
        data: {
          server: "filesystem",
          status: { state: "ready" },
        },
        eventIds: ["mcp_startup_update-2026-04-13T10:02:03Z"],
      },
      {
        type: "lifecycle",
        eventType: "mcp_startup_complete",
        title: "MCP startup complete",
        data: {
          servers: ["filesystem"],
        },
        eventIds: ["mcp_startup_complete-2026-04-13T10:02:04Z"],
      },
    ])
  })

  it("projects generic MCP methods and ignores events without a method name", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("resources/list", "2026-04-13T10:02:05Z", {
        params: { cursor: "next-page" },
      }, {
        category: "jsonrpc_request",
        direction: "upstream_to_codex",
      }),
      {
        ...makeEvent("ignored-event", "2026-04-13T10:02:06Z", {
          payloadOnly: true,
        }, {
          category: "jsonrpc_request",
          direction: "upstream_to_codex",
        }),
        event_type: undefined,
      },
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-resources/list-2026-04-13T10:02:05Z",
        role: "assistant",
        createdAt: "2026-04-13T10:02:05Z",
        parts: [{
          type: "mcp_method",
          method: "resources/list",
          title: "resources/list",
          params: { cursor: "next-page" },
          eventIds: ["resources/list-2026-04-13T10:02:05Z"],
        }],
      },
    ])
  })

  it("keeps raw_frame and response events out of the conversation projection", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("raw_frame", "2026-04-13T10:03:00Z", "noise", {
        category: "raw_frame",
      }),
      makeEvent("response", "2026-04-13T10:03:01Z", { result: { ok: true } }, {
        category: "response",
      }),
    ])

    expect(thread.messages).toEqual([])
  })

  it("projects thread_name_updated as a known lifecycle event and updates the header title", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("thread_name_updated", "2026-04-13T10:04:00Z", {
        params: { msg: { type: "thread_name_updated", thread_name: "Renamed remotely" } },
      }),
    ])

    expect(thread.header.title).toBe("Renamed remotely")
    expect(thread.messages).toEqual([
      {
        id: "assistant-thread_name_updated-2026-04-13T10:04:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:04:00Z",
        parts: [{
          type: "lifecycle",
          eventType: "thread_name_updated",
          title: "Thread name updated",
          data: { thread_name: "Renamed remotely" },
          eventIds: ["thread_name_updated-2026-04-13T10:04:00Z"],
        }],
      },
    ])
  })

  it("keeps unfinished streaming deltas visible and drops them once terminal events arrive", () => {
    const unfinished = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("agent_message_delta", "2026-04-13T10:05:00Z", {
        params: { msg: { type: "agent_message_delta", delta: "Hello " } },
      }, { turn_id: "turn-stream-text" }),
      makeEvent("agent_message_content_delta", "2026-04-13T10:05:01Z", {
        params: { msg: { type: "agent_message_content_delta", text: "world" } },
      }, { turn_id: "turn-stream-text" }),
      makeEvent("agent_reasoning_raw_content_delta", "2026-04-13T10:05:02Z", {
        params: { msg: { type: "agent_reasoning_raw_content_delta", text: "raw notes" } },
      }, { turn_id: "turn-stream-reasoning" }),
    ])

    expect(unfinished.messages).toEqual([
      {
        id: "assistant-agent_message_delta-2026-04-13T10:05:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:05:00Z",
        parts: [
          {
            type: "text",
            text: "Hello world",
            eventIds: [
              "agent_message_delta-2026-04-13T10:05:00Z",
              "agent_message_content_delta-2026-04-13T10:05:01Z",
            ],
          },
          {
            type: "reasoning",
            text: "raw notes",
            variant: "raw_content",
            eventIds: ["agent_reasoning_raw_content_delta-2026-04-13T10:05:02Z"],
          },
        ],
      },
    ])

    const completed = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("agent_message_delta", "2026-04-13T10:05:00Z", {
        params: { msg: { type: "agent_message_delta", delta: "partial" } },
      }, { turn_id: "turn-stream-text" }),
      makeEvent("agent_reasoning_delta", "2026-04-13T10:05:01Z", {
        params: { msg: { type: "agent_reasoning_delta", text: "hidden chain" } },
      }, { turn_id: "turn-stream-reasoning" }),
      makeEvent("agent_reasoning", "2026-04-13T10:05:02Z", {
        params: { msg: { type: "agent_reasoning", text: "final reasoning" } },
      }, { turn_id: "turn-stream-reasoning" }),
      makeEvent("agent_message", "2026-04-13T10:05:03Z", {
        params: { msg: { type: "agent_message", message: "final answer" } },
      }, { turn_id: "turn-stream-text" }),
    ])

    expect(completed.messages).toEqual([
      {
        id: "assistant-agent_reasoning-2026-04-13T10:05:02Z",
        role: "assistant",
        createdAt: "2026-04-13T10:05:02Z",
        parts: [
          {
            type: "reasoning",
            text: "final reasoning",
            variant: "reasoning",
            eventIds: ["agent_reasoning-2026-04-13T10:05:02Z"],
          },
          {
            type: "text",
            text: "final answer",
            eventIds: ["agent_message-2026-04-13T10:05:03Z"],
          },
        ],
      },
    ])
  })

  it("projects running and error tool states from fallback and result branches", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("exec_command_begin", "2026-04-13T10:06:00Z", {
        params: {
          msg: {
            type: "exec_command_begin",
            call_id: "exec-running",
            cmd: ["pnpm", "test"],
            cwd: "C:/repo/web",
          },
        },
      }, { command_call_id: "exec-running" }),
      makeEvent("web_search_begin", "2026-04-13T10:06:01Z", {
        params: { msg: { type: "web_search_begin", call_id: "search-1" } },
      }),
      makeEvent("mcp_tool_call_begin", "2026-04-13T10:06:02Z", {
        params: {
          msg: {
            type: "mcp_tool_call_begin",
            call_id: "mcp-err",
            invocation: {
              server: "filesystem",
              tool: "read_file",
              arguments: { path: "/tmp/missing.txt" },
            },
          },
        },
      }, { tool_call_id: "mcp-err" }),
      makeEvent("mcp_tool_call_end", "2026-04-13T10:06:03Z", {
        params: {
          msg: {
            type: "mcp_tool_call_end",
            call_id: "mcp-err",
            result: { Err: { message: "missing" } },
          },
        },
      }, { tool_call_id: "mcp-err" }),
      makeEvent("patch_apply_begin", "2026-04-13T10:06:04Z", {
        params: {
          msg: {
            type: "patch_apply_begin",
            call_id: "patch-1",
            changes: {
              "web/src/lib/sse.ts": "@@",
            },
          },
        },
      }),
      makeEvent("patch_apply_end", "2026-04-13T10:06:05Z", {
        params: {
          msg: {
            type: "patch_apply_end",
            call_id: "patch-1",
            success: false,
            stderr: "conflict",
          },
        },
      }),
      makeEvent("dynamic_tool_call_request", "2026-04-13T10:06:06Z", {
        params: {
          msg: {
            type: "dynamic_tool_call_request",
            call_id: "dyn-err",
            tool: "open_url",
            arguments: { url: "https://example.com" },
          },
        },
      }),
      makeEvent("dynamic_tool_call_response", "2026-04-13T10:06:07Z", {
        params: {
          msg: {
            type: "dynamic_tool_call_response",
            call_id: "dyn-err",
            tool: "open_url",
            success: false,
            result: { error: "blocked" },
          },
        },
      }),
    ])

    expect(thread.messages).toMatchObject([
      {
        id: "assistant-exec_command_begin-2026-04-13T10:06:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:06:00Z",
        parts: [
          {
            type: "tool",
            toolKind: "exec_command",
            title: "pnpm test",
            status: "running",
            command: ["pnpm", "test"],
            cwd: "C:/repo/web",
            output: undefined,
            exitCode: undefined,
            eventIds: ["exec_command_begin-2026-04-13T10:06:00Z"],
          },
          {
            type: "tool",
            toolKind: "web_search",
            title: "Web search",
            status: "running",
            query: undefined,
            actionType: undefined,
            eventIds: ["web_search_begin-2026-04-13T10:06:01Z"],
          },
          {
            type: "tool",
            toolKind: "mcp_tool_call",
            title: "filesystem.read_file",
            status: "error",
            server: "filesystem",
            toolName: "read_file",
            args: { path: "/tmp/missing.txt" },
            result: { Err: { message: "missing" } },
            duration: undefined,
            eventIds: [
              "mcp_tool_call_begin-2026-04-13T10:06:02Z",
              "mcp_tool_call_end-2026-04-13T10:06:03Z",
            ],
          },
          {
            type: "tool",
            toolKind: "patch_apply",
            title: "Patch apply",
            status: "error",
            changes: ["web/src/lib/sse.ts"],
            stdout: undefined,
            stderr: "conflict",
            eventIds: [
              "patch_apply_begin-2026-04-13T10:06:04Z",
              "patch_apply_end-2026-04-13T10:06:05Z",
            ],
          },
          {
            type: "tool",
            toolKind: "dynamic_tool_call",
            title: "Dynamic tool: open_url",
            status: "error",
            toolName: "open_url",
            args: { url: "https://example.com" },
            result: { error: "blocked" },
            duration: undefined,
            eventIds: [
              "dynamic_tool_call_request-2026-04-13T10:06:06Z",
              "dynamic_tool_call_response-2026-04-13T10:06:07Z",
            ],
          },
        ],
      },
    ])
  })

  it("aligns exec, MCP, dynamic tool, and image generation parts with real protocol payload fields", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("exec_command_begin", "2026-04-13T10:06:00Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "exec_command_begin",
            call_id: "exec-real",
            turn_id: "turn-1",
            command: ["ls"],
            cwd: "/tmp",
            parsed_cmd: [],
            source: "agent",
          },
        },
      }, { command_call_id: "exec-real" }),
      makeEvent("exec_command_end", "2026-04-13T10:06:01Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "exec_command_end",
            call_id: "exec-real",
            turn_id: "turn-1",
            command: ["ls"],
            cwd: "/tmp",
            parsed_cmd: [],
            source: "agent",
            stdout: "",
            stderr: "exec command rejected by user",
            aggregated_output: "exec command rejected by user",
            exit_code: -1,
            duration: "0ms",
            formatted_output: "",
            status: "declined",
          },
        },
      }, { command_call_id: "exec-real" }),
      makeEvent("mcp_tool_call_begin", "2026-04-13T10:06:02Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "mcp_tool_call_begin",
            call_id: "mcp-real",
            invocation: {
              server: "docs",
              tool: "lookup",
              arguments: { id: "123" },
            },
          },
        },
      }, { tool_call_id: "mcp-real" }),
      makeEvent("mcp_tool_call_end", "2026-04-13T10:06:03Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "mcp_tool_call_end",
            call_id: "mcp-real",
            invocation: {
              server: "docs",
              tool: "lookup",
              arguments: { id: "123" },
            },
            duration: "8ms",
            result: {
              Ok: {
                content: [{ type: "text", text: "result" }],
                structured_content: { id: "123" },
                is_error: true,
                meta: { "ui/resourceUri": "ui://widget/lookup.html" },
              },
            },
          },
        },
      }, { tool_call_id: "mcp-real" }),
      makeEvent("dynamic_tool_call_request", "2026-04-13T10:06:04Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "dynamic_tool_call_request",
            call_id: "dyn-real",
            turn_id: "turn-1",
            tool: "lookup_ticket",
            arguments: { id: "ABC-123" },
          },
        },
      }),
      makeEvent("dynamic_tool_call_response", "2026-04-13T10:06:05Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "dynamic_tool_call_response",
            call_id: "dyn-real",
            turn_id: "turn-1",
            tool: "lookup_ticket",
            arguments: { id: "ABC-123" },
            content_items: [{ type: "inputText", text: "Ticket is open" }],
            success: false,
            error: "permission denied",
            duration: "42ms",
          },
        },
      }),
      makeEvent("image_generation_begin", "2026-04-13T10:06:06Z", {
        method: "codex/event",
        params: { msg: { type: "image_generation_begin", call_id: "img-real" } },
      }),
      makeEvent("image_generation_end", "2026-04-13T10:06:07Z", {
        method: "codex/event",
        params: {
          msg: {
            type: "image_generation_end",
            call_id: "img-real",
            status: "completed",
            revised_prompt: "a tiny blue robot",
            result: "ok",
            saved_path: "C:/tmp/robot.png",
          },
        },
      }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-exec_command_begin-2026-04-13T10:06:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:06:00Z",
        parts: [
          {
            type: "tool",
            toolKind: "exec_command",
            title: "ls",
            status: "error",
            command: ["ls"],
            cwd: "/tmp",
            output: "exec command rejected by user",
            stderr: "exec command rejected by user",
            exitCode: -1,
            eventIds: [
              "exec_command_begin-2026-04-13T10:06:00Z",
              "exec_command_end-2026-04-13T10:06:01Z",
            ],
          },
          {
            type: "tool",
            toolKind: "mcp_tool_call",
            title: "docs.lookup",
            status: "error",
            server: "docs",
            toolName: "lookup",
            args: { id: "123" },
            result: {
              Ok: {
                content: [{ type: "text", text: "result" }],
                structured_content: { id: "123" },
                is_error: true,
                meta: { "ui/resourceUri": "ui://widget/lookup.html" },
              },
            },
            duration: "8ms",
            eventIds: [
              "mcp_tool_call_begin-2026-04-13T10:06:02Z",
              "mcp_tool_call_end-2026-04-13T10:06:03Z",
            ],
          },
          {
            type: "tool",
            toolKind: "dynamic_tool_call",
            title: "Dynamic tool: lookup_ticket",
            status: "error",
            toolName: "lookup_ticket",
            args: { id: "ABC-123" },
            result: [{ type: "inputText", text: "Ticket is open" }],
            error: "permission denied",
            duration: "42ms",
            eventIds: [
              "dynamic_tool_call_request-2026-04-13T10:06:04Z",
              "dynamic_tool_call_response-2026-04-13T10:06:05Z",
            ],
          },
          {
            type: "tool",
            toolKind: "image_generation",
            title: "Image generation",
            status: "complete",
            result: "ok",
            imageStatus: "completed",
            revisedPrompt: "a tiny blue robot",
            savedPath: "C:/tmp/robot.png",
            eventIds: [
              "image_generation_begin-2026-04-13T10:06:06Z",
              "image_generation_end-2026-04-13T10:06:07Z",
            ],
          },
        ],
      },
    ])
  })

  it("falls back when command metadata or payload wrappers are missing", () => {
    const utf16Bytes = Array.from("hello from utf16")
      .flatMap((char) => {
        const code = char.charCodeAt(0)
        return [code & 0xFF, code >> 8]
      })
    const utf16Chunk = btoa(String.fromCharCode(...utf16Bytes))
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("exec_command_output_delta", "2026-04-13T10:07:00Z", {
        chunk: "$$$not-base64$$$",
        call_id: "exec-orphan",
      }, { command_call_id: "exec-orphan" }),
      makeEvent("exec_command_end", "2026-04-13T10:07:01Z", {
        exit_code: 0,
        call_id: "exec-orphan",
      }, { command_call_id: "exec-orphan" }),
      makeEvent("exec_command_begin", "2026-04-13T10:07:02Z", {
        cmd: ["node", "print.js"],
        call_id: "exec-utf16",
      }, { command_call_id: "exec-utf16" }),
      makeEvent("exec_command_output_delta", "2026-04-13T10:07:03Z", {
        chunk: utf16Chunk,
        call_id: "exec-utf16",
      }, { command_call_id: "exec-utf16" }),
      makeEvent("exec_command_end", "2026-04-13T10:07:04Z", {
        exit_code: 0,
        call_id: "exec-utf16",
      }, { command_call_id: "exec-utf16" }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-exec_command_output_delta-2026-04-13T10:07:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:07:00Z",
        parts: [
          {
            type: "tool",
            toolKind: "exec_command",
            title: "Command exec-orphan",
            status: "complete",
            command: [],
            cwd: undefined,
            output: "$$$not-base64$$$",
            exitCode: 0,
            eventIds: [
              "exec_command_output_delta-2026-04-13T10:07:00Z",
              "exec_command_end-2026-04-13T10:07:01Z",
            ],
          },
          {
            type: "tool",
            toolKind: "exec_command",
            title: "node print.js",
            status: "complete",
            command: ["node", "print.js"],
            cwd: undefined,
            output: "hello from utf16",
            exitCode: 0,
            eventIds: [
              "exec_command_begin-2026-04-13T10:07:02Z",
              "exec_command_output_delta-2026-04-13T10:07:03Z",
              "exec_command_end-2026-04-13T10:07:04Z",
            ],
          },
        ],
      },
    ])
  })

  it("drops empty streaming buckets that never produced text", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("agent_message_delta", "2026-04-13T10:08:00Z", {
        params: { msg: { type: "agent_message_delta", delta: "" } },
      }, { turn_id: "turn-empty-stream" }),
      makeEvent("agent_reasoning_raw_content_delta", "2026-04-13T10:08:01Z", {
        params: { msg: { type: "agent_reasoning_raw_content_delta", text: "" } },
      }, { turn_id: "turn-empty-stream-2" }),
    ])

    expect(thread.messages).toEqual([])
  })

  it("preserves agent_message phase and memory citation metadata", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("agent_message", "2026-04-13T10:09:00Z", {
        params: {
          msg: {
            type: "agent_message",
            message: "Final answer from memory.",
            phase: "final_answer",
            memory_citation: {
              entries: [
                {
                  path: "memory.md",
                  lineStart: 10,
                  lineEnd: 12,
                  note: "Previous decision",
                },
              ],
              rolloutIds: ["rollout-1"],
            },
          },
        },
      }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-agent_message-2026-04-13T10:09:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:09:00Z",
        parts: [
          {
            type: "text",
            text: "Final answer from memory.",
            phase: "final_answer",
            memoryCitation: {
              entries: [
                {
                  path: "memory.md",
                  lineStart: 10,
                  lineEnd: 12,
                  note: "Previous decision",
                },
              ],
              rolloutIds: ["rollout-1"],
            },
            eventIds: ["agent_message-2026-04-13T10:09:00Z"],
          },
        ],
      },
    ])
  })

  it("attaches terminal interaction events to exec command tool parts", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("exec_command_begin", "2026-04-13T10:10:00Z", {
        params: {
          msg: {
            type: "exec_command_begin",
            call_id: "exec-interactive",
            command: ["python"],
            cwd: "C:/repo",
          },
        },
      }, { command_call_id: "exec-interactive" }),
      makeEvent("terminal_interaction", "2026-04-13T10:10:01Z", {
        params: {
          msg: {
            type: "terminal_interaction",
            call_id: "exec-interactive",
            process_id: "pty-1",
            stdin: "print('hi')\n",
          },
        },
      }, { command_call_id: "exec-interactive" }),
      makeEvent("exec_command_end", "2026-04-13T10:10:02Z", {
        params: {
          msg: {
            type: "exec_command_end",
            call_id: "exec-interactive",
            status: "completed",
            exit_code: 0,
            stdout: "hi\n",
          },
        },
      }, { command_call_id: "exec-interactive" }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-exec_command_begin-2026-04-13T10:10:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:10:00Z",
        parts: [
          {
            type: "tool",
            toolKind: "exec_command",
            title: "python",
            status: "complete",
            command: ["python"],
            cwd: "C:/repo",
            output: "hi\n",
            stdout: "hi\n",
            stderr: undefined,
            interactions: [
              {
                processId: "pty-1",
                stdin: "print('hi')\n",
                interactionInput: undefined,
              },
            ],
            exitCode: 0,
            eventIds: [
              "exec_command_begin-2026-04-13T10:10:00Z",
              "terminal_interaction-2026-04-13T10:10:01Z",
              "exec_command_end-2026-04-13T10:10:02Z",
            ],
          },
        ],
      },
    ])
  })

  it("projects collab agent events as structured tool parts", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("collab_agent_spawn_begin", "2026-04-13T10:11:00Z", {
        params: {
          msg: {
            type: "collab_agent_spawn_begin",
            call_id: "collab-spawn",
            sender_thread_id: "thread-main",
            prompt: "Investigate failing tests",
            model: "gpt-5.4-mini",
            reasoning_effort: "medium",
          },
        },
      }),
      makeEvent("collab_agent_spawn_end", "2026-04-13T10:11:01Z", {
        params: {
          msg: {
            type: "collab_agent_spawn_end",
            call_id: "collab-spawn",
            sender_thread_id: "thread-main",
            new_thread_id: "thread-worker",
            new_agent_nickname: "James",
            new_agent_role: "worker",
            prompt: "Investigate failing tests",
            model: "gpt-5.4-mini",
            reasoning_effort: "medium",
            status: "running",
          },
        },
      }),
      makeEvent("collab_waiting_begin", "2026-04-13T10:11:02Z", {
        params: {
          msg: {
            type: "collab_waiting_begin",
            call_id: "collab-wait",
            sender_thread_id: "thread-main",
            receiver_thread_ids: ["thread-worker"],
          },
        },
      }),
      makeEvent("collab_waiting_end", "2026-04-13T10:11:03Z", {
        params: {
          msg: {
            type: "collab_waiting_end",
            call_id: "collab-wait",
            sender_thread_id: "thread-main",
            statuses: {
              "thread-worker": { Errored: "timeout" },
            },
          },
        },
      }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-collab_agent_spawn_begin-2026-04-13T10:11:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:11:00Z",
        parts: [
          {
            type: "tool",
            toolKind: "collab_agent",
            title: "Spawn agent",
            status: "complete",
            toolName: "Spawn agent",
            args: {
              call_id: "collab-spawn",
              sender_thread_id: "thread-main",
              prompt: "Investigate failing tests",
              model: "gpt-5.4-mini",
              reasoning_effort: "medium",
            },
            result: {
              call_id: "collab-spawn",
              sender_thread_id: "thread-main",
              new_thread_id: "thread-worker",
              new_agent_nickname: "James",
              new_agent_role: "worker",
              prompt: "Investigate failing tests",
              model: "gpt-5.4-mini",
              reasoning_effort: "medium",
              status: "running",
            },
            eventIds: [
              "collab_agent_spawn_begin-2026-04-13T10:11:00Z",
              "collab_agent_spawn_end-2026-04-13T10:11:01Z",
            ],
          },
          {
            type: "tool",
            toolKind: "collab_agent",
            title: "Wait for agents",
            status: "error",
            toolName: "Wait for agents",
            args: {
              call_id: "collab-wait",
              sender_thread_id: "thread-main",
              receiver_thread_ids: ["thread-worker"],
            },
            result: {
              call_id: "collab-wait",
              sender_thread_id: "thread-main",
              statuses: {
                "thread-worker": { Errored: "timeout" },
              },
            },
            eventIds: [
              "collab_waiting_begin-2026-04-13T10:11:02Z",
              "collab_waiting_end-2026-04-13T10:11:03Z",
            ],
          },
        ],
      },
    ])
  })

  it("projects remaining protocol lifecycle events without falling back to unknown", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("realtime_conversation_started", "2026-04-13T10:12:00Z", {
        params: { msg: { type: "realtime_conversation_started", session_id: "rt-1", version: "v2" } },
      }),
      makeEvent("realtime_conversation_closed", "2026-04-13T10:12:01Z", {
        params: { msg: { type: "realtime_conversation_closed", reason: "user ended call" } },
      }),
      makeEvent("get_history_entry_response", "2026-04-13T10:12:02Z", {
        params: { msg: { type: "get_history_entry_response", offset: 3, log_id: 99 } },
      }),
      makeEvent("mcp_list_tools_response", "2026-04-13T10:12:03Z", {
        params: { msg: { type: "mcp_list_tools_response", tools: { "fs/read": {} } } },
      }),
      makeEvent("list_skills_response", "2026-04-13T10:12:04Z", {
        params: { msg: { type: "list_skills_response", skills: [{ name: "assistant-ui" }] } },
      }),
      makeEvent("skills_update_available", "2026-04-13T10:12:05Z", {
        params: { msg: { type: "skills_update_available" } },
      }),
      makeEvent("raw_response_item", "2026-04-13T10:12:06Z", {
        params: { msg: { type: "raw_response_item", item: { type: "message" } } },
      }),
      makeEvent("hook_started", "2026-04-13T10:12:07Z", {
        params: { msg: { type: "hook_started", run: { id: "hook-1", status: "running" } } },
      }),
    ])

    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]?.parts).toEqual([
      {
        type: "lifecycle",
        eventType: "realtime_conversation_started",
        title: "Realtime conversation started",
        data: { session_id: "rt-1", version: "v2" },
        eventIds: ["realtime_conversation_started-2026-04-13T10:12:00Z"],
      },
      {
        type: "lifecycle",
        eventType: "realtime_conversation_closed",
        title: "Realtime conversation closed",
        data: { reason: "user ended call" },
        eventIds: ["realtime_conversation_closed-2026-04-13T10:12:01Z"],
      },
      {
        type: "lifecycle",
        eventType: "get_history_entry_response",
        title: "History entry response",
        data: { offset: 3, log_id: 99 },
        eventIds: ["get_history_entry_response-2026-04-13T10:12:02Z"],
      },
      {
        type: "lifecycle",
        eventType: "mcp_list_tools_response",
        title: "MCP tools response",
        data: { tools: { "fs/read": {} } },
        eventIds: ["mcp_list_tools_response-2026-04-13T10:12:03Z"],
      },
      {
        type: "lifecycle",
        eventType: "list_skills_response",
        title: "Skills response",
        data: { skills: [{ name: "assistant-ui" }] },
        eventIds: ["list_skills_response-2026-04-13T10:12:04Z"],
      },
      {
        type: "lifecycle",
        eventType: "skills_update_available",
        title: "Skills update available",
        data: {},
        eventIds: ["skills_update_available-2026-04-13T10:12:05Z"],
      },
      {
        type: "lifecycle",
        eventType: "raw_response_item",
        title: "Raw response item",
        data: { item: { type: "message" } },
        eventIds: ["raw_response_item-2026-04-13T10:12:06Z"],
      },
      {
        type: "lifecycle",
        eventType: "hook_started",
        title: "Hook started",
        data: { run: { id: "hook-1", status: "running" } },
        eventIds: ["hook_started-2026-04-13T10:12:07Z"],
      },
    ])
    expect(thread.messages[0]?.parts.every(part => part.type !== "unknown")).toBe(true)
  })

  it("treats plan_delta as delta content instead of an empty plan update", () => {
    const thread = projectReadonlyAssistantThread(makeSessionDetail(), [
      makeEvent("plan_delta", "2026-04-13T10:13:00Z", {
        params: { msg: { type: "plan_delta", delta: "- add tests" } },
      }),
    ])

    expect(thread.messages).toEqual([
      {
        id: "assistant-plan_delta-2026-04-13T10:13:00Z",
        role: "assistant",
        createdAt: "2026-04-13T10:13:00Z",
        parts: [
          {
            type: "plan",
            title: "Plan delta",
            steps: [],
            delta: "- add tests",
            eventIds: ["plan_delta-2026-04-13T10:13:00Z"],
          },
        ],
      },
    ])
  })
})
