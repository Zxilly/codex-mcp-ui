import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fixtureClientSource, fixtureSession } from "@/lib/fixtures"
import { ClientSourceTree } from "./client-source-tree"

const sources = [fixtureClientSource]
const sessionsBySource = { [fixtureClientSource.source_key]: [fixtureSession] }

describe("clientSourceTree", () => {
  it("renders client source header with session count badge", () => {
    render(
      <ClientSourceTree
        sources={sources}
        sessionsBySource={sessionsBySource}
        selectedThreadId={null}
        onSelectSession={() => {}}
      />,
    )
    expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument()
    expect(screen.getByText(/pid 18244/)).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("marks the active session with accent styling", () => {
    render(
      <ClientSourceTree
        sources={sources}
        sessionsBySource={sessionsBySource}
        selectedThreadId={fixtureSession.thread_id}
        onSelectSession={() => {}}
      />,
    )
    const button = screen.getByRole("button", { name: fixtureSession.thread_id })
    expect(button.className).toMatch(/bg-accent/)
  })

  it("invokes onSelectSession with the clicked thread id", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <ClientSourceTree
        sources={sources}
        sessionsBySource={sessionsBySource}
        selectedThreadId={null}
        onSelectSession={onSelect}
      />,
    )
    await user.click(screen.getByRole("button", { name: fixtureSession.thread_id }))
    expect(onSelect).toHaveBeenCalledWith(fixtureSession.thread_id)
  })

  it("shows \"no sessions yet\" when a source has an empty session list", () => {
    render(
      <ClientSourceTree
        sources={sources}
        sessionsBySource={{ [fixtureClientSource.source_key]: [] }}
        selectedThreadId={null}
        onSelectSession={() => {}}
      />,
    )
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
  })

  it("shows the waiting message when there are no sources", () => {
    render(
      <ClientSourceTree
        sources={[]}
        sessionsBySource={{}}
        selectedThreadId={null}
        onSelectSession={() => {}}
      />,
    )
    expect(screen.getByText(/Waiting for registrations/i)).toBeInTheDocument()
  })
})
