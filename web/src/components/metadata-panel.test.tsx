import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fixtureClientSource, fixtureSession } from "@/lib/fixtures"
import { MetadataPanel } from "./metadata-panel"

describe("metadataPanel", () => {
  it("renders empty state when nothing selected", () => {
    render(<MetadataPanel session={null} source={null} />)
    expect(screen.getByText(/No session selected/i)).toBeInTheDocument()
  })

  it("renders session and source fields with em-dash fallbacks", () => {
    render(
      <MetadataPanel
        session={{ ...fixtureSession, cwd: undefined }}
        source={fixtureClientSource}
      />,
    )
    expect(screen.getByText("Thread id")).toBeInTheDocument()
    expect(screen.getByText(fixtureSession.thread_id)).toBeInTheDocument()
    expect(screen.getByText("Model")).toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    expect(screen.getByText(fixtureClientSource.executable!)).toBeInTheDocument()
  })
})
