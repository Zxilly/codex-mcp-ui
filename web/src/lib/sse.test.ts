import { describe, expect, it } from "vitest"
import { buildStreamURL } from "./sse"

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
