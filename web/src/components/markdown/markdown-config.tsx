import type { Components } from "react-markdown"
import { all } from "lowlight"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import "highlight.js/styles/github.css"

export const CODE_BLOCK_CLASS = /\blanguage-/

export const MARKDOWN_COMPONENTS: Components = {
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
    <h3
      {...props}
      className="mb-1.5 mt-3 text-[13.5px] font-semibold uppercase tracking-[0.08em] text-foreground/80 first:mt-0"
    >
      {children}
    </h3>
  ),
  ul: ({ children, ...props }) => (
    <ul
      {...props}
      className="mb-3 ml-5 list-disc space-y-1 marker:text-muted-foreground/60 last:mb-0"
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      {...props}
      className="mb-3 ml-5 list-decimal space-y-1 marker:font-mono marker:text-muted-foreground last:mb-0"
    >
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

export const REHYPE_PLUGINS = [
  [rehypeHighlight, { detect: true, ignoreMissing: true, languages: all }],
] as never

export const REMARK_PLUGINS = [remarkGfm]
