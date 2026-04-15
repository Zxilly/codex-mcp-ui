import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import App from "./App"

vi.mock("@/components/workbench/session-workbench", () => ({
  LiveSessionWorkbench: () => <div>mock workbench</div>,
}))

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}))

describe("App", () => {
  it("wraps the workbench in the error boundary and query provider shell", () => {
    render(<App />)

    expect(screen.getByTestId("error-boundary")).toBeInTheDocument()
    expect(screen.getByText("mock workbench")).toBeInTheDocument()
  })
})
