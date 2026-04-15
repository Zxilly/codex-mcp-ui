import { render, screen } from "@testing-library/react"
import { within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ReadonlyAssistantThread as ReadonlyAssistantThreadProjection } from "@/lib/assistant-projection"
import { ReadonlyAssistantThread } from "./readonly-assistant-thread"

const thread: ReadonlyAssistantThreadProjection = {
  header: {
    title: "Readonly thread",
    subtitle: "Claude Desktop | pid 18244 | thread-1",
    badges: ["gpt-5.4", "active"],
    threadId: "thread-1",
    clientName: "Claude Desktop",
    clientPid: 18244,
    model: "gpt-5.4",
    status: "active",
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    cwd: "E:/Project/CS_Project/2026/codex-mcp-ui",
    firstSeen: "2026-04-13T09:00:00Z",
    lastSeen: "2026-04-13T09:05:00Z",
  },
  messages: [
    {
      id: "user-1",
      role: "user",
      createdAt: "2026-04-13T09:00:00Z",
      parts: [{ type: "text", text: "Summarize the run", eventIds: ["evt-user"] }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-04-13T09:00:01Z",
      parts: [{ type: "text", text: "Readonly reply", eventIds: ["evt-assistant"] }],
    },
  ],
}

const markdownThread: ReadonlyAssistantThreadProjection = {
  ...thread,
  messages: [
    {
      id: "user-markdown",
      role: "user",
      createdAt: "2026-04-13T09:00:00Z",
      parts: [
        {
          type: "text",
          text: "# Keep this literal\n\n- first item\n- second item\n\n`inline code`",
          eventIds: ["evt-user-markdown"],
        },
      ],
    },
    {
      id: "assistant-markdown",
      role: "assistant",
      createdAt: "2026-04-13T09:00:02Z",
      parts: [
        {
          type: "text",
          text: "# Title\n\n- first item\n- second item\n\n`inline code`\n\n```ts\nconst total = 2\n```\n\n| Name | Value |\n| --- | --- |\n| total | 2 |",
          eventIds: ["evt-markdown-text"],
        },
        {
          type: "reasoning",
          text: "1. inspect cache\n2. reset history",
          eventIds: ["evt-markdown-reasoning"],
          variant: "reasoning",
        },
      ],
    },
  ],
}

describe("readonlyAssistantThread", () => {
  it("renders readonly conversation through assistant-ui message primitives without composer or send affordances", () => {
    render(
      <ReadonlyAssistantThread
        thread={thread}
        status="ready"
        error={null}
      />,
    )

    expect(screen.getByText("Readonly reply")).toBeInTheDocument()
    expect(screen.getByText("Readonly reply").closest("[data-message-id]")).not.toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull()
  })

  it("renders markdown formatting for assistant text while keeping projected user text literal", () => {
    render(
      <ReadonlyAssistantThread
        thread={markdownThread}
        status="ready"
        error={null}
      />,
    )

    const userMessage = screen.getByText((_, element) => {
      return element?.tagName.toLowerCase() === "pre"
        && element.textContent?.includes("# Keep this literal")
    }).closest("[data-message-id]") as HTMLElement | null
    expect(userMessage).not.toBeNull()
    if (!userMessage)
      throw new Error("Expected user message to be rendered")

    expect(
      within(userMessage).getByText((_, element) => {
        return element?.tagName.toLowerCase() === "pre"
          && element.textContent?.includes("# Keep this literal")
      }),
    ).toBeInTheDocument()
    expect(within(userMessage).queryByRole("heading", { name: "Keep this literal" })).toBeNull()
    expect(within(userMessage).queryByRole("list")).toBeNull()

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.getByText("inline code")).toContainHTML("code")
    expect(document.querySelector("pre code")).toHaveTextContent("const total = 2")
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("inspect cache")).toBeInTheDocument()
    expect(screen.getByText("reset history")).toBeInTheDocument()
  })
})
