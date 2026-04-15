import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "./api"

type FetchArgs = Parameters<typeof fetch>

function mockJSON(body: unknown, init: Partial<ResponseInit> = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    }),
  )
}

describe("api client", () => {
  const calls: FetchArgs[] = []
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal("fetch", (...args: FetchArgs) => {
      calls.push(args)
      const url = typeof args[0] === "string" ? args[0] : args[0].toString()
      if (url === "/api/v1/client-sources") {
        return mockJSON({ items: [{ source_key: "s1", client_name: "Claude", pid: 1, first_seen: "", last_seen: "", session_count: 2 }] })
      }
      if (url === "/api/v1/client-sources/s1/sessions") {
        return mockJSON({ items: [{ thread_id: "t1", source_key: "s1", first_seen: "", last_seen: "" }] })
      }
      if (url === "/api/v1/sessions/t1") {
        return mockJSON({
          session: { thread_id: "t1", source_key: "s1", first_seen: "", last_seen: "" },
          client_source: { source_key: "s1", client_name: "Claude", pid: 1, first_seen: "", last_seen: "", session_count: 1 },
          recent_events: [],
        })
      }
      if (url.startsWith("/api/v1/sessions/t1/events")) {
        return mockJSON({ items: [] })
      }
      return mockJSON({ error: "not found" }, { status: 404 })
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("unwraps items on list endpoints", async () => {
    const sources = await api.clientSources()
    expect(sources).toHaveLength(1)
    expect(sources[0].source_key).toBe("s1")
    expect(calls[0]?.[1]).toMatchObject({
      headers: { accept: "application/json" },
    })
  })

  it("uRL-encodes path segments", async () => {
    await api.sessionsForSource("claude|pid-42").catch(() => {})
    expect(calls.at(-1)?.[0]).toBe("/api/v1/client-sources/claude%7Cpid-42/sessions")
  })

  it("returns SessionDetail shape as-is", async () => {
    const detail = await api.session("t1")
    expect(detail.session.thread_id).toBe("t1")
    expect(detail.client_source.client_name).toBe("Claude")
  })

  it("passes limit and cursor through as query string", async () => {
    await api.eventsPage("t1", { limit: 10, cursor: "1000|evt-a" })
    const url = calls.at(-1)?.[0] as string
    expect(url).toMatch(/\/api\/v1\/sessions\/t1\/events\?/)
    expect(url).toContain("limit=10")
    expect(url).toContain("cursor=1000%7Cevt-a")
  })

  it("omits empty query params for eventsPage", async () => {
    await api.eventsPage("t1")
    expect(calls.at(-1)?.[0]).toBe("/api/v1/sessions/t1/events")

    await api.eventsPage("t1", { cursor: "cursor-only" })
    expect(calls.at(-1)?.[0]).toBe("/api/v1/sessions/t1/events?cursor=cursor-only")

    await api.eventsPage("t1", { limit: 25 })
    expect(calls.at(-1)?.[0]).toBe("/api/v1/sessions/t1/events?limit=25")
  })

  it("does not expose the legacy events wrapper with the invalid before cursor contract", () => {
    expect(api).not.toHaveProperty("events")
  })

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          new Response("boom", { status: 500, statusText: "Internal Server Error" }),
        ),
    )
    await expect(api.clientSources()).rejects.toThrow(/500/)
  })
})
