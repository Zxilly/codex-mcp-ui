import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fixtureClientSource, fixtureSession } from "@/lib/fixtures"
import { SessionHeader } from "./session-header"

describe("sessionHeader", () => {
  it("renders the empty state when no session is selected", () => {
    render(<SessionHeader session={null} source={null} />)
    expect(
      screen.getByRole("heading", { name: /Session detail/i }),
    ).toBeInTheDocument()
  })

  it("renders client + thread id and status badges when a session is selected", () => {
    render(
      <SessionHeader session={fixtureSession} source={fixtureClientSource} />,
    )
    expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument()
    expect(screen.getByText(/thread thread-abc123/)).toBeInTheDocument()
    expect(screen.getByText("gpt-5.4")).toBeInTheDocument()
    expect(screen.getByText("active")).toBeInTheDocument()
  })

  it("omits model and status badges when those fields are empty", () => {
    render(
      <SessionHeader
        session={{ ...fixtureSession, model: undefined, status: undefined }}
        source={fixtureClientSource}
      />,
    )
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument()
    expect(screen.queryByText("active")).not.toBeInTheDocument()
  })
})
