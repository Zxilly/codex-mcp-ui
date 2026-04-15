import { describe, expect, it } from "vitest"
import { compactPayloadPreview, prettyPayload, truncate } from "./utils"

describe("utils", () => {
  it("truncates long strings and preserves short or empty values", () => {
    expect(truncate("")).toBe("")
    expect(truncate("short", 10)).toBe("short")
    expect(truncate("abcdefgh", 5)).toBe("abcde…")
  })

  it("formats payloads and falls back when stringify fails", () => {
    expect(prettyPayload({ ok: true })).toBe("{\n  \"ok\": true\n}")

    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(prettyPayload(circular)).toBe("[object Object]")
  })

  it("builds compact payload previews for strings, objects, and invalid JSON payloads", () => {
    expect(compactPayloadPreview("plain text", 20)).toBe("plain text")
    expect(compactPayloadPreview({ ok: true }, 20)).toBe("{\"ok\":true}")

    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(compactPayloadPreview(circular, 20)).toBe("[object Object]")
  })
})
