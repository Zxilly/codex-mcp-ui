import { act, render, renderHook, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"
import type { EventRecord, PaginatedEventsResponse } from "./types"
import { loadSessionHistory, useSessionHistory } from "./session-history"

function makeEvent(
  eventId: string,
  timestamp: string,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    event_id: eventId,
    timestamp,
    proxy_instance_id: "proxy-1",
    source_key: "source-1",
    thread_id: "thread-1",
    direction: "local",
    category: "test",
    payload: { eventId },
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("loadSessionHistory", () => {
  it("loads all pages and merges live events by id", async () => {
    const eventsPage = vi.fn<
      (threadId: string, opts?: { limit?: number, cursor?: string }) => Promise<PaginatedEventsResponse>
    >()
      .mockResolvedValueOnce({
        items: [
          makeEvent("evt-b", "2026-04-13T10:00:00.000Z"),
          makeEvent("evt-a", "2026-04-13T09:00:00.000Z"),
        ],
        next_cursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        items: [
          makeEvent("evt-c", "2026-04-13T10:00:00.000Z"),
          makeEvent("evt-a", "2026-04-13T09:00:00.000Z"),
        ],
      })

    const events = await loadSessionHistory("thread-1", {
      eventsPage,
      bufferedEvents: [
        makeEvent("evt-live", "2026-04-13T11:00:00.000Z"),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z"),
      ],
    })

    expect(eventsPage).toHaveBeenNthCalledWith(1, "thread-1", { limit: 500 })
    expect(eventsPage).toHaveBeenNthCalledWith(2, "thread-1", {
      limit: 500,
      cursor: "cursor-1",
    })
    expect(events.map(evt => evt.event_id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-c",
      "evt-live",
    ])
  })
})

describe("useSessionHistory", () => {
  it("keeps events emitted during backfill", async () => {
    const page = deferred<PaginatedEventsResponse>()
    const eventsPage = vi.fn(() => page.promise)
    let emitEvent: ((event: EventRecord) => void) | null = null

    const { result } = renderHook(() =>
      useSessionHistory("thread-1", {
        eventsPage,
        subscribeEvents: ({ onEvent }) => {
          emitEvent = onEvent
          return () => {}
        },
      }),
    )

    expect(result.current.status).toBe("loading")

    act(() => {
      emitEvent?.(makeEvent("evt-live", "2026-04-13T11:00:00.000Z"))
    })

    page.resolve({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z"),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z"),
      ],
    })

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-live",
    ])
    expect(result.current.error).toBeNull()
  })

  it("resumes with since and merges replay/live events into authoritative history", async () => {
    const initialPage = vi.fn().mockResolvedValue({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-replay" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-replay" }),
      ],
    })

    const initialHook = renderHook(() =>
      useSessionHistory("thread-replay", {
        eventsPage: initialPage,
        subscribeEvents: () => () => {},
      }),
    )

    await waitFor(() => {
      expect(initialHook.result.current.status).toBe("ready")
    })
    initialHook.unmount()

    const replayPage = vi.fn().mockResolvedValue({
      items: [],
    })
    const subscribeEvents = vi.fn(({ since, onEvent }: { since?: string, onEvent: (event: EventRecord) => void }) => {
      expect(since).toBe("evt-b")
      onEvent(makeEvent("evt-c", "2026-04-13T11:00:00.000Z", { thread_id: "thread-replay" }))
      return () => {}
    })

    const { result } = renderHook(() =>
      useSessionHistory("thread-replay", {
        eventsPage: replayPage,
        subscribeEvents,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(subscribeEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-replay",
        since: "evt-b",
      }),
    )
    expect(replayPage).toHaveBeenCalledWith("thread-replay", { limit: 500 })
    expect(result.current.events.map(evt => evt.event_id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-c",
    ])
  })

  it("falls back to paged history when replay is unavailable for the since cursor", async () => {
    const initialPage = vi.fn().mockResolvedValue({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-fallback" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-fallback" }),
      ],
    })

    const initialHook = renderHook(() =>
      useSessionHistory("thread-fallback", {
        eventsPage: initialPage,
        subscribeEvents: () => () => {},
      }),
    )

    await waitFor(() => {
      expect(initialHook.result.current.status).toBe("ready")
    })
    initialHook.unmount()

    const page = deferred<PaginatedEventsResponse>()
    const fallbackPage = vi.fn(() => page.promise)
    const subscribeEvents = vi.fn(({ since }: { since?: string }) => {
      expect(since).toBe("evt-b")
      return () => {}
    })

    const { result } = renderHook(() =>
      useSessionHistory("thread-fallback", {
        eventsPage: fallbackPage,
        subscribeEvents,
      }),
    )

    await waitFor(() => {
      expect(fallbackPage).toHaveBeenCalledWith("thread-fallback", { limit: 500 })
    })

    page.resolve({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-fallback" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-fallback" }),
        makeEvent("evt-c", "2026-04-13T11:00:00.000Z", { thread_id: "thread-fallback" }),
      ],
    })

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(subscribeEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-fallback",
        since: "evt-b",
      }),
    )
    expect(result.current.events.map(evt => evt.event_id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-c",
    ])
    expect(result.current.refreshKey).toBeGreaterThan(0)
  })

  it("keeps paged backfill active when a fast live event arrives before replay proves the gap is closed", async () => {
    const initialPage = vi.fn().mockResolvedValue({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-race" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-race" }),
      ],
    })

    const initialHook = renderHook(() =>
      useSessionHistory("thread-race", {
        eventsPage: initialPage,
        subscribeEvents: () => () => {},
      }),
    )

    await waitFor(() => {
      expect(initialHook.result.current.status).toBe("ready")
    })
    initialHook.unmount()

    const page = deferred<PaginatedEventsResponse>()
    const fallbackPage = vi.fn(() => page.promise)
    const subscribeEvents = vi.fn(({ since, onEvent }: { since?: string, onEvent: (event: EventRecord) => void }) => {
      expect(since).toBe("evt-b")
      onEvent(makeEvent("evt-d", "2026-04-13T12:00:00.000Z", { thread_id: "thread-race" }))
      return () => {}
    })

    const { result } = renderHook(() =>
      useSessionHistory("thread-race", {
        eventsPage: fallbackPage,
        subscribeEvents,
      }),
    )

    await waitFor(() => {
      expect(fallbackPage).toHaveBeenCalledWith("thread-race", { limit: 500 })
    })

    page.resolve({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-race" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-race" }),
        makeEvent("evt-c", "2026-04-13T11:00:00.000Z", { thread_id: "thread-race" }),
      ],
    })

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-c",
      "evt-d",
    ])
  })

  it("does not expose the previous thread history during the first render after a thread switch", async () => {
    const nextPage = deferred<PaginatedEventsResponse>()
    const eventsPage = vi.fn((threadId: string) => {
      if (threadId === "thread-switch-a") {
        return Promise.resolve({
          items: [
            makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-switch-a" }),
          ],
        })
      }

      return nextPage.promise
    })
    const snapshots: Array<{
      threadId: string | null
      status: string
      eventIds: string[]
    }> = []

    function Probe({ threadId }: { threadId: string | null }) {
      const state = useSessionHistory(threadId, {
        eventsPage,
        subscribeEvents: () => () => {},
      })

      snapshots.push({
        threadId,
        status: state.status,
        eventIds: state.events.map(evt => evt.event_id),
      })

      return null
    }

    const { rerender } = render(createElement(Probe, { threadId: "thread-switch-a" }))

    await waitFor(() => {
      expect(snapshots.some(snapshot =>
        snapshot.threadId === "thread-switch-a"
        && snapshot.status === "ready"
        && snapshot.eventIds.includes("evt-a"),
      )).toBe(true)
    })

    snapshots.length = 0
    rerender(createElement(Probe, { threadId: "thread-switch-b" }))

    expect(snapshots[0]).toEqual({
      threadId: "thread-switch-b",
      status: "loading",
      eventIds: [],
    })

    nextPage.resolve({
      items: [
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-switch-b" }),
      ],
    })

    await waitFor(() => {
      expect(snapshots.some(snapshot =>
        snapshot.threadId === "thread-switch-b"
        && snapshot.status === "ready"
        && snapshot.eventIds.includes("evt-b"),
      )).toBe(true)
    })
  })

  it("preserves merged history when a parse error occurs after ready state", async () => {
    const eventsPage = vi.fn().mockResolvedValue({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-parse" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-parse" }),
      ],
    })
    let raiseParseError: ((error: unknown) => void) | null = null

    const { result } = renderHook(() =>
      useSessionHistory("thread-parse", {
        eventsPage,
        subscribeEvents: ({ onParseError }) => {
          raiseParseError = onParseError ?? null
          return () => {}
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    const beforeError = result.current.events.map(evt => evt.event_id)

    act(() => {
      raiseParseError?.(new Error("bad sse payload"))
    })

    await waitFor(() => {
      expect(result.current.status).toBe("error")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual(beforeError)
    expect(result.current.error?.message).toMatch(/bad sse payload/)
  })

  it("preserves the refresh key when the selected thread is cleared", async () => {
    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string | null }) =>
        useSessionHistory(threadId, {
          eventsPage: vi.fn().mockResolvedValue({
            items: [makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-clear" })],
          }),
          subscribeEvents: () => () => {},
        }),
      { initialProps: { threadId: "thread-clear" } as { threadId: string | null } },
    )

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    const refreshKey = result.current.refreshKey
    expect(refreshKey).toBeGreaterThan(0)

    rerender({ threadId: null } as { threadId: string | null })

    expect(result.current).toMatchObject({
      events: [],
      status: "idle",
      error: null,
      refreshKey,
    })
  })

  it("keeps cached and buffered events when backfill fails", async () => {
    const initialPage = vi.fn().mockResolvedValue({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-failure" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-failure" }),
      ],
    })

    const initialHook = renderHook(() =>
      useSessionHistory("thread-failure", {
        eventsPage: initialPage,
        subscribeEvents: () => () => {},
      }),
    )

    await waitFor(() => {
      expect(initialHook.result.current.status).toBe("ready")
    })
    initialHook.unmount()

    const page = deferred<PaginatedEventsResponse>()
    let emitEvent: ((event: EventRecord) => void) | null = null
    const { result } = renderHook(() =>
      useSessionHistory("thread-failure", {
        eventsPage: vi.fn(() => page.promise),
        subscribeEvents: ({ onEvent }) => {
          emitEvent = onEvent
          return () => {}
        },
      }),
    )

    act(() => {
      emitEvent?.(makeEvent("evt-live", "2026-04-13T11:00:00.000Z", { thread_id: "thread-failure" }))
    })

    page.reject(new Error("backfill failed"))

    await waitFor(() => {
      expect(result.current.status).toBe("error")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-live",
    ])
    expect(result.current.error?.message).toMatch(/backfill failed/)
  })

  it("surfaces parse errors that happen before backfill completes while preserving buffered events", async () => {
    const page = deferred<PaginatedEventsResponse>()
    let emitEvent: ((event: EventRecord) => void) | null = null
    let raiseParseError: ((error: unknown) => void) | null = null

    const { result } = renderHook(() =>
      useSessionHistory("thread-loading-parse", {
        eventsPage: vi.fn(() => page.promise),
        subscribeEvents: ({ onEvent, onParseError }) => {
          emitEvent = onEvent
          raiseParseError = onParseError ?? null
          return () => {}
        },
      }),
    )

    act(() => {
      emitEvent?.(makeEvent("evt-live", "2026-04-13T11:00:00.000Z", { thread_id: "thread-loading-parse" }))
      raiseParseError?.("bad payload")
    })

    await waitFor(() => {
      expect(result.current.status).toBe("error")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual(["evt-live"])
    expect(result.current.error?.message).toMatch(/bad payload/)
  })

  it("ignores late backfill results after switching away from a thread and unsubscribes the prior stream", async () => {
    const threadAPage = deferred<PaginatedEventsResponse>()
    const threadBPage = deferred<PaginatedEventsResponse>()
    const unsubscribeA = vi.fn()
    const unsubscribeB = vi.fn()

    const eventsPage = vi.fn((threadId: string) => {
      if (threadId === "thread-a")
        return threadAPage.promise
      return threadBPage.promise
    })

    const subscribeEvents = vi.fn(({ threadId }: { threadId?: string }) => {
      return threadId === "thread-a" ? unsubscribeA : unsubscribeB
    })

    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string | null }) =>
        useSessionHistory(threadId, { eventsPage, subscribeEvents }),
      { initialProps: { threadId: "thread-a" } },
    )

    rerender({ threadId: "thread-b" })

    expect(unsubscribeA).toHaveBeenCalledTimes(1)

    threadAPage.resolve({
      items: [makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-a" })],
    })
    threadBPage.resolve({
      items: [makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-b" })],
    })

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual(["evt-b"])
  })

  it("does not bump refreshKey when revisiting a cached thread resolves to the same event ids", async () => {
    const eventsPage = vi.fn().mockResolvedValue({
      items: [
        makeEvent("evt-a", "2026-04-13T09:00:00.000Z", { thread_id: "thread-stable" }),
        makeEvent("evt-b", "2026-04-13T10:00:00.000Z", { thread_id: "thread-stable" }),
      ],
    })

    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string | null }) =>
        useSessionHistory(threadId, {
          eventsPage,
          subscribeEvents: () => () => {},
        }),
      { initialProps: { threadId: "thread-stable" } as { threadId: string | null } },
    )

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    const firstRefreshKey = result.current.refreshKey
    rerender({ threadId: null } as { threadId: string | null })
    rerender({ threadId: "thread-stable" })

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(result.current.events.map(evt => evt.event_id)).toEqual(["evt-a", "evt-b"])
    expect(result.current.refreshKey).toBe(firstRefreshKey)
  })
})
