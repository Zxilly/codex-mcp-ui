import type {
  ReadonlyAssistantMessage,
  ReadonlyAssistantPart,
  ReadonlyAssistantThread as ReadonlyAssistantThreadProjection,
} from "@/lib/assistant-projection"
import type { SessionHistoryStatus } from "@/lib/session-history"
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react"
import { AlertCircle, Bot, User } from "lucide-react"
import {
  createContext,
  use,
  useMemo,
} from "react"
import { MarkdownBody } from "@/components/message-block"
import { Badge } from "@/components/ui/badge"
import { asRecord } from "@/lib/assistant-projection"
import { useReadonlyAssistantRuntime } from "@/lib/readonly-assistant-runtime"
import { prettyPayload } from "@/lib/utils"

interface ReadonlyAssistantThreadProps {
  thread: ReadonlyAssistantThreadProjection | null
  status: SessionHistoryStatus
  error: Error | null
}

const ProjectedMessagesContext = createContext<readonly ReadonlyAssistantMessage[]>([])

const MESSAGE_COMPONENTS = {
  UserMessage: ReadonlyMessage,
  AssistantMessage: ReadonlyMessage,
}

export function ReadonlyAssistantThread({
  thread,
  status,
  error,
}: ReadonlyAssistantThreadProps) {
  const projectedMessages = thread?.messages ?? []
  const runtime = useReadonlyAssistantRuntime(projectedMessages)
  const header = thread?.header

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ProjectedMessagesContext value={projectedMessages}>
        <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          {header && (
            <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{header.title}</h2>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {header.subtitle}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {header.badges.map(badge => (
                  <Badge key={badge} variant="secondary">
                    {badge}
                  </Badge>
                ))}
              </div>
            </header>
          )}
          <ThreadPrimitive.Empty>
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              {status === "loading" ? "Loading conversation..." : "No conversation history yet."}
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-4">
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error.message}</span>
                </div>
              )}
              <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
            </div>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </ProjectedMessagesContext>
    </AssistantRuntimeProvider>
  )
}

function ReadonlyMessage() {
  const projectedMessages = use(ProjectedMessagesContext)
  const runtimeMessage = useAuiState(state => state.message)
  const message = projectedMessages[runtimeMessage.index]
  const Icon = runtimeMessage.role === "assistant" ? Bot : User

  if (!message)
    return null

  return (
    <MessagePrimitive.Root
      className="grid grid-cols-[auto_1fr] items-start gap-3"
      data-role={runtimeMessage.role}
    >
      <div className="mt-1 rounded-full border bg-muted p-2 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{message.role}</span>
          <span className="text-xs text-muted-foreground">
            {formatCreatedAt(message.createdAt)}
          </span>
        </div>
        <div className="space-y-2">
          {message.parts.map(part => (
            <ReadonlyMessagePart
              key={partKey(message.id, part)}
              part={part}
              role={message.role}
            />
          ))}
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function partKey(messageId: string, part: ReadonlyAssistantPart) {
  switch (part.type) {
    case "text":
      return `${messageId}-${part.type}-${part.eventIds?.join("-") ?? part.text}`
    case "reasoning":
      return `${messageId}-${part.type}-${part.variant}-${part.text}`
    default:
      return `${messageId}-${part.type}-${part.title}`
  }
}

function ReadonlyMessagePart({
  part,
  role,
}: {
  part: ReadonlyAssistantPart
  role: ReadonlyAssistantMessage["role"]
}) {
  if (part.type === "text") {
    if (role === "user") {
      return (
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-foreground">
          {part.text}
        </pre>
      )
    }
    return (
      <div className="space-y-2">
        {Boolean(part.phase || part.memoryCitation) && (
          <div className="flex flex-wrap items-center gap-2">
            {part.phase && (
              <Badge variant="outline">{part.phase}</Badge>
            )}
            {hasMemoryCitationEntries(part.memoryCitation) && (
              <Badge variant="secondary">
                {memoryCitationLabel(part.memoryCitation)}
              </Badge>
            )}
          </div>
        )}
        <div className="text-sm leading-6 text-foreground">
          <MarkdownBody text={part.text} />
        </div>
        {hasMemoryCitationEntries(part.memoryCitation) && (
          <details className="rounded-md border bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Memory citation
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
              {prettyPayload(part.memoryCitation)}
            </pre>
          </details>
        )}
      </div>
    )
  }

  if (part.type === "reasoning") {
    return (
      <details className="rounded-md border bg-muted/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reasoning
        </summary>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          <MarkdownBody text={part.text} />
        </div>
      </details>
    )
  }

  return <ReadonlyStructuredPart part={part} />
}

function ReadonlyStructuredPart({ part }: { part: ReadonlyAssistantPart }) {
  const title = partLabel(part)
  const body = useMemo(() => prettyPayload(part), [part])

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
        {body}
      </pre>
    </div>
  )
}

function partLabel(part: ReadonlyAssistantPart) {
  switch (part.type) {
    case "approval":
    case "lifecycle":
    case "mcp_method":
    case "plan":
    case "tool":
    case "unknown":
      return part.title
    case "reasoning":
      return part.variant === "raw_content" ? "Raw reasoning" : "Reasoning"
    case "text":
      return "Text"
    default:
      return "Part"
  }
}

function formatCreatedAt(createdAt: string | undefined) {
  if (!createdAt)
    return ""
  const value = new Date(createdAt)
  if (Number.isNaN(value.valueOf()))
    return ""
  return value.toLocaleString()
}

function hasMemoryCitationEntries(value: unknown) {
  const record = asRecord(value)
  return Array.isArray(record.entries) && record.entries.length > 0
}

function memoryCitationLabel(value: unknown) {
  const record = asRecord(value)
  const count = Array.isArray(record.entries) ? record.entries.length : 0
  return count === 1 ? "1 memory citation" : `${count} memory citations`
}
