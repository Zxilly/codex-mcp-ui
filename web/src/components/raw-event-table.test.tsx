import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fixtureEvents } from "@/lib/fixtures"
import { RawEventTable } from "./raw-event-table"

describe("rawEventTable", () => {
  it("filters raw events by event type", async () => {
    const user = userEvent.setup()
    render(<RawEventTable events={fixtureEvents} />)
    await user.type(
      screen.getByLabelText(/event type/i),
      "session_configured",
    )
    const bodyRows = screen
      .getAllByRole("row")
      .filter(row => row.querySelector("td"))
    expect(bodyRows).toHaveLength(2)
  })

  it("filters raw events by request id", async () => {
    const user = userEvent.setup()
    render(<RawEventTable events={fixtureEvents} />)
    await user.type(screen.getByLabelText(/request id/i), "req-2")
    const bodyRows = screen
      .getAllByRole("row")
      .filter(row => row.querySelector("td"))
    expect(bodyRows).toHaveLength(3)
  })
})
