import type { Components } from "react-markdown"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { HIGHLIGHT_LANGUAGES } from "@/lib/highlight"
import { cn } from "@/lib/utils"

export type MessageRole = "user" | "agent" | "reasoning"

// HighlightedCode renders a bare code block (no message chrome) with the
// same syntax-highlighting pipeline used by MessageBlock. Use it whenever a
// component wants to show formatted source such as JSON payloads or tool
// arguments, so the colors stay consistent across the UI.
export function HighlightedCode({ code, language = "json" }: { code: string, language?: string }) {
  return (
    <Markdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {`\`\`\`${language}\n${code}\n\`\`\``}
    </Markdown>
  )
}

interface MessageBlockProps {
  role: MessageRole
  text: string
  timestamp: string
  streaming?: boolean
  // Secondary label, e.g. agent_message.phase or reasoning section title.
  annotation?: string
}

interface Variant {
  sigil: string
  label: string
  container: string
  bodySize: string
  leading: string
  muted?: boolean
}

const VARIANTS: Record<MessageRole, Variant> = {
  user: {
    sigil: "▸",
    label: "you",
    container: "border-l-2 border-l-foreground bg-foreground/[0.03]",
    bodySize: "text-[13.5px]",
    leading: "leading-[1.7]",
  },
  agent: {
    sigil: "◆",
    label: "agent",
    container: "border-l-2 border-l-foreground/70",
    bodySize: "text-[14.5px]",
    leading: "leading-[1.7]",
  },
  reasoning: {
    sigil: "◦",
    label: "thinking",
    container: "border-l border-dashed border-l-muted-foreground/50",
    bodySize: "text-[13.5px]",
    leading: "leading-[1.65]",
    muted: true,
  },
}

export function MessageBlock({
  role,
  text,
  timestamp,
  streaming,
  annotation,
}: MessageBlockProps) {
  const v = VARIANTS[role]
  return (
    <article
      className={cn(
        "group relative rounded-md pl-5 pr-4 py-3 transition-colors",
        v.container,
      )}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden
            className={cn(
              "font-mono text-[11px]",
              role === "user" && "text-foreground",
              role === "agent" && "text-foreground/70",
              role === "reasoning" && "text-muted-foreground/70",
            )}
          >
            {v.sigil}
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {v.label}
          </span>
          {annotation && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              ·
              {" "}
              {annotation}
            </span>
          )}
          {streaming && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
              <span
                className="inline-block size-1.5 rounded-full bg-amber-500"
                style={{ animation: "caret-blink 1s step-end infinite" }}
              />
              streaming
            </span>
          )}
        </div>
        <time className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {timestamp}
        </time>
      </header>
      <div
        className={cn(
          "max-w-[72ch] font-sans",
          v.bodySize,
          v.leading,
          v.muted ? "text-muted-foreground italic" : "text-foreground",
        )}
      >
        {role === "user"
          ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.6] text-foreground/90">
                {text}
                {streaming && <StreamCaret />}
              </pre>
            )
          : (
              <MarkdownBody text={text} streaming={streaming} />
            )}
      </div>
    </article>
  )
}

const CODE_BLOCK_CLASS = /\blanguage-/

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children, ...props }) => (
    <p {...props} className="mb-3 last:mb-0 whitespace-pre-wrap break-words">
      {children}
    </p>
  ),
  h1: ({ children, ...props }) => (
    <h1 {...props} className="mb-2 mt-4 text-[17px] font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 {...props} className="mb-2 mt-4 text-[15px] font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 {...props} className="mb-1.5 mt-3 text-[13.5px] font-semibold uppercase tracking-[0.08em] text-foreground/80 first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className="mb-3 ml-5 list-disc space-y-1 marker:text-muted-foreground/60 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="mb-3 ml-5 list-decimal space-y-1 marker:font-mono marker:text-muted-foreground last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="pl-1">
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="mb-3 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground last:mb-0"
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline decoration-muted-foreground/50 underline-offset-[3px] hover:decoration-foreground"
    >
      {children}
    </a>
  ),
  strong: ({ children, ...props }) => (
    <strong {...props} className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em {...props} className="italic">
      {children}
    </em>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = CODE_BLOCK_CLASS.test(className ?? "")
    if (isBlock) {
      return (
        <code className={cn("font-mono text-[12.5px] leading-[1.55]", className)} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em] text-foreground"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className="mb-3 overflow-x-auto rounded-md border last:mb-0 [&>code]:block [&>code]:px-3 [&>code]:py-2.5 [&>code]:text-[12.5px] [&>code]:leading-[1.6]"
    >
      {children}
    </pre>
  ),
  hr: props => <hr {...props} className="my-4 border-border" />,
  table: ({ children, ...props }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table {...props} className="w-full border-collapse text-[13px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead {...props} className="border-b border-border">
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th {...props} className="px-2 py-1.5 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="border-b border-border/50 px-2 py-1.5">
      {children}
    </td>
  ),
}

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [
  [rehypeHighlight, { detect: true, ignoreMissing: true, languages: HIGHLIGHT_LANGUAGES }],
] as never

function MarkdownBody({ text, streaming }: { text: string, streaming?: boolean }) {
  return (
    <>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {text}
      </Markdown>
      {streaming && (
        <span aria-hidden className="inline-flex">
          <StreamCaret />
        </span>
      )}
    </>
  )
}

function StreamCaret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[0.5ch] translate-y-[0.15em] bg-current align-baseline"
      style={{ animation: "caret-blink 1s step-end infinite" }}
    />
  )
}
