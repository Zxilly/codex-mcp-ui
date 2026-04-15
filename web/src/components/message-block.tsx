import {
  MARKDOWN_COMPONENTS,
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
} from "@/components/markdown/markdown-config"
import { Markdown } from "@/components/markdown/markdown-runtime"
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

export function MarkdownBody({ text, streaming }: { text: string, streaming?: boolean }) {
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
