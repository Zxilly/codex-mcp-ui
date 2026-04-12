import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { DashboardShell } from "./dashboard-shell"

const fetchMock = vi.fn(async () => {
  return new Response(JSON.stringify({ items: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
})

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DashboardShell />
    </QueryClientProvider>,
  )
}

describe("dashboardShell", () => {
  it("renders the fullscreen shell with the client sources pane", () => {
    renderShell()
    expect(screen.getByText(/client sources/i)).toBeInTheDocument()
    // With no data and no selected session the empty-state prompt is shown
    // instead of the tab strip.
    expect(screen.getAllByText(/Select a session/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole("tab", { name: /Milestones/i })).toBeNull()
  })
})
