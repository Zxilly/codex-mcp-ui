import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HighlightedCode, MarkdownBody, MessageBlock } from "./message-block"

describe("messageBlock", () => {
  it("renders user messages as literal preformatted text with streaming metadata", () => {
    render(
      <MessageBlock
        role="user"
        text={"# literal\n- item"}
        timestamp="10:32:00"
        streaming
        annotation="prompt"
      />,
    )

    expect(screen.getByText("you")).toBeInTheDocument()
    expect(screen.getByText("streaming")).toBeInTheDocument()
    expect(screen.getByText(/prompt/)).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => {
        return element?.tagName.toLowerCase() === "pre"
          && element.textContent?.includes("# literal")
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "literal" })).toBeNull()
  })

  it("renders markdown bodies through the full custom component set", () => {
    render(
      <MarkdownBody
        text={[
          "# Title",
          "",
          "## Subtitle",
          "",
          "### Eyebrow",
          "",
          "- first",
          "- second",
          "",
          "1. one",
          "2. two",
          "",
          "> quoted",
          "",
          "[assistant-ui](https://assistant-ui.com)",
          "",
          "**bold** and *italic* and `inline`",
          "",
          "---",
          "",
          "```ts",
          "const total = 2",
          "```",
          "",
          "| name | value |",
          "| --- | --- |",
          "| total | 2 |",
        ].join("\n")}
        streaming
      />,
    )

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Subtitle" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Eyebrow" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "assistant-ui" })).toHaveAttribute(
      "href",
      "https://assistant-ui.com",
    )
    expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong")
    expect(screen.getByText("italic").tagName.toLowerCase()).toBe("em")
    expect(screen.getByText("inline").tagName.toLowerCase()).toBe("code")
    expect(document.querySelector("pre code")).toHaveTextContent("const total = 2")
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("quoted").closest("blockquote")).not.toBeNull()
  })

  it("renders a fenced ruby block through the markdown highlighter", () => {
    render(
      <MarkdownBody
        text={[
          "```ruby",
          "puts 'hello'",
          "```",
        ].join("\n")}
      />,
    )

    const code = document.querySelector("pre code")
    expect(code).toHaveTextContent("puts 'hello'")
    expect(code?.className).toContain("hljs")
    expect(code?.className).toContain("language-ruby")
  })

  it("accepts built-in highlight.js aliases such as js", () => {
    render(
      <MarkdownBody
        text={[
          "```js",
          "const answer = 42",
          "```",
        ].join("\n")}
      />,
    )

    const code = document.querySelector("pre code")
    expect(code).toHaveTextContent("const answer = 42")
    expect(code?.className).toContain("hljs")
    expect(code?.className).toContain("language-js")
  })

  it("keeps auto-detection enabled for untagged fenced blocks", () => {
    render(
      <MarkdownBody
        text={[
          "```",
          "SELECT id, name FROM users;",
          "```",
        ].join("\n")}
      />,
    )

    const code = document.querySelector("pre code")
    expect(code).toHaveTextContent("SELECT id, name FROM users;")
    expect(code?.className).toContain("hljs")
    expect(code?.className).toMatch(/\blanguage-/)
  })

  it("renders highlighted code blocks without message chrome", () => {
    render(<HighlightedCode code={`{"ok":true}`} />)

    expect(document.querySelector("pre code")).toHaveTextContent(`{"ok":true}`)
  })
})
