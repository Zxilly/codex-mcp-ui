import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorBoundary } from "./error-boundary"

function Boom({ fail }: { fail: boolean }) {
  if (fail)
    throw new Error("kapow")
  return <div>child ok</div>
}

// Lives at module scope so React's reconciler treats it as a stable
// component type across retry re-renders.
let controlledShouldFail = true
function Controlled() {
  return <Boom fail={controlledShouldFail} />
}

describe("errorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it("renders children in the happy path", () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText("child ok")).toBeInTheDocument()
  })

  it("renders an alert with the error message when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText(/kapow/)).toBeInTheDocument()
  })

  it("lets the user retry back into a healthy subtree", async () => {
    const user = userEvent.setup()
    controlledShouldFail = true
    const { rerender } = render(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toBeInTheDocument()
    controlledShouldFail = false
    await user.click(screen.getByRole("button", { name: /Retry/i }))
    rerender(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>,
    )
    expect(screen.getByText("child ok")).toBeInTheDocument()
  })
})
