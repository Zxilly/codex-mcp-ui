import { fetchEventSource } from "@microsoft/fetch-event-source"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildStreamURL, subscribeEvents } from "./sse"

vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: vi.fn(() => Promise.resolve(undefined)),
}))

const fetchEventSourceMock = vi.mocked(fetchEventSource)

describe("buildStreamURL", () => {
  it("returns the bare stream path when no filters are provided", () => {
    expect(buildStreamURL({})).toBe("/api/v1/stream")
  })

  it("appends thread_id when given", () => {
    expect(buildStreamURL({ threadId: "thr-1" })).toBe(
      "/api/v1/stream?thread_id=thr-1",
    )
  })

  it("appends source_key when given", () => {
    expect(buildStreamURL({ sourceKey: "claude|pid-42" })).toBe(
      "/api/v1/stream?source_key=claude%7Cpid-42",
    )
  })

  it("combines both filters in stable order", () => {
    const url = buildStreamURL({ sourceKey: "s", threadId: "t" })
    expect(url.startsWith("/api/v1/stream?")).toBe(true)
    const params = new URLSearchParams(url.split("?")[1])
    expect(params.get("source_key")).toBe("s")
    expect(params.get("thread_id")).toBe("t")
  })

  it("builds a stream URL with since for replay", () => {
    expect(buildStreamURL({ threadId: "t1", since: "evt-9" })).toContain("since=evt-9")
  })
})

describe("subscribeEvents", () => {
  afterEach(() => {
    fetchEventSourceMock.mockClear()
  })

  function latestOptions() {
    const call = fetchEventSourceMock.mock.calls.at(-1)
    if (!call)
      throw new Error("Expected fetchEventSource to be called")
    return call[1]
  }

  function makeMessage(
    options: NonNullable<ReturnType<typeof latestOptions>>,
    data: string,
  ): Parameters<NonNullable<typeof options.onmessage>>[0] {
    return {
      id: "",
      event: "message",
      data,
      retry: undefined,
    }
  }

  it("passes the replay-aware URL to fetchEventSource", () => {
    const unsubscribe = subscribeEvents({
      sourceKey: "s1",
      threadId: "t1",
      since: "evt-9",
      onEvent: () => {},
    })

    expect(fetchEventSourceMock).toHaveBeenCalledWith(
      "/api/v1/stream?source_key=s1&thread_id=t1&since=evt-9",
      expect.objectContaining({
        openWhenHidden: true,
        signal: expect.any(AbortSignal),
      }),
    )

    unsubscribe()
  })

  it("publishes status transitions and parsed events from the SSE lifecycle", async () => {
    const statuses: string[] = []
    const events: unknown[] = []

    subscribeEvents({
      onEvent: event => events.push(event),
      onStatusChange: status => statuses.push(status),
    })

    const options = latestOptions()
    await options.onopen?.(new Response())
    options.onmessage?.(makeMessage(options, JSON.stringify({ event_id: "evt-1", event_type: "agent_message" })))
    options.onmessage?.(makeMessage(options, ""))
    options.onerror?.(new Error("temporary disconnect"))
    options.onclose?.()

    expect(statuses).toEqual(["connecting", "live", "disconnected", "disconnected"])
    expect(events).toEqual([{ event_id: "evt-1", event_type: "agent_message" }])
  })

  it("reports parse errors and aborts the controller during unsubscribe", () => {
    const parseErrors: unknown[] = []
    const statuses: string[] = []
    const unsubscribe = subscribeEvents({
      onEvent: () => {
        throw new Error("should not receive invalid payloads")
      },
      onParseError: err => parseErrors.push(err),
      onStatusChange: status => statuses.push(status),
    })

    const options = latestOptions()
    options.onmessage?.(makeMessage(options, "{not-json}"))
    expect(parseErrors).toHaveLength(1)
    expect((options.signal as AbortSignal).aborted).toBe(false)

    unsubscribe()

    expect((options.signal as AbortSignal).aborted).toBe(true)
    expect(statuses.at(-1)).toBe("disconnected")
  })
})
