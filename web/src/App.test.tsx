import type { PropsWithChildren } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import App from "./App"

function MockLiveSessionWorkbench() {
  return <div>mock workbench</div>
}

function MockErrorBoundary({ children }: PropsWithChildren) {
  return <div data-testid="error-boundary">{children}</div>
}

vi.mock("@/components/workbench/session-workbench", () => ({
  LiveSessionWorkbench: MockLiveSessionWorkbench,
}))

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: MockErrorBoundary,
}))

describe("app", () => {
  it("wraps the workbench in the error boundary and query provider shell", () => {
    render(<App />)

    expect(screen.getByTestId("error-boundary")).toBeInTheDocument()
    expect(screen.getByText("mock workbench")).toBeInTheDocument()
  })
})
