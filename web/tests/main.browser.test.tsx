import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/App", () => ({
  default: () => <div data-testid="mock-app">mock app</div>,
}))

describe("main entry (browser)", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="root"></div>`
    vi.resetModules()
  })

  it("mounts the app into the root element in a real browser environment", async () => {
    await import("@/main")

    await expect
      .poll(() => document.querySelector("[data-testid='mock-app']")?.textContent ?? "")
      .toContain("mock app")
  })
})
