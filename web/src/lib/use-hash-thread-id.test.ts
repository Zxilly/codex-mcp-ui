import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useHashThreadId } from "./use-hash-thread-id"

describe("useHashThreadId", () => {
  beforeEach(() => {
    window.location.hash = ""
  })
  afterEach(() => {
    window.location.hash = ""
  })

  it("reads the initial value from the URL hash", () => {
    window.location.hash = "#thread=thr-42"
    const { result } = renderHook(() => useHashThreadId())
    expect(result.current[0]).toBe("thr-42")
  })

  it("writes to the URL hash when set", () => {
    const { result } = renderHook(() => useHashThreadId())
    act(() => result.current[1]("thr-x"))
    expect(window.location.hash).toBe("#thread=thr-x")
    expect(result.current[0]).toBe("thr-x")
  })

  it("clears the hash when set to null", () => {
    window.location.hash = "#thread=existing"
    const { result } = renderHook(() => useHashThreadId())
    act(() => result.current[1](null))
    expect(window.location.hash).toBe("")
    expect(result.current[0]).toBeNull()
  })

  it("reacts to external hashchange events", () => {
    const { result } = renderHook(() => useHashThreadId())
    act(() => {
      window.location.hash = "#thread=external"
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(result.current[0]).toBe("external")
  })

  it("ignores hashes with unknown prefixes", () => {
    window.location.hash = "#other=foo"
    const { result } = renderHook(() => useHashThreadId())
    expect(result.current[0]).toBeNull()
  })

  it("decodes encoded characters", () => {
    window.location.hash = `#thread=${encodeURIComponent("thr/with/slash")}`
    const { result } = renderHook(() => useHashThreadId())
    expect(result.current[0]).toBe("thr/with/slash")
  })
})
