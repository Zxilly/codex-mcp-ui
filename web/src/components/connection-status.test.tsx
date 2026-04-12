import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ConnectionStatus } from "./connection-status"

describe("connectionStatus", () => {
  it.each([
    ["connecting", /Connecting/i],
    ["live", /Live/i],
    ["disconnected", /Disconnected/i],
  ] as const)("renders label %s", (state, pattern) => {
    render(<ConnectionStatus state={state} />)
    expect(screen.getByText(pattern)).toBeInTheDocument()
  })

  it("exposes the current status via aria-label for screen readers", () => {
    render(<ConnectionStatus state="live" />)
    expect(screen.getByLabelText(/SSE stream Live/)).toBeInTheDocument()
  })
})
