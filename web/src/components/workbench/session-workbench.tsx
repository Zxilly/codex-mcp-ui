import type { ClientSource, Session, SessionDetail } from "@/lib/types"
import { useQuery } from "@tanstack/react-query"
import {
  useEffect,
  useMemo,
} from "react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { MetadataPanel } from "@/components/metadata-panel"
import { RawEventTable } from "@/components/raw-event-table"
import { SessionHeader } from "@/components/session-header"
import { projectReadonlyAssistantThread } from "@/lib/assistant-projection"
import { useSessionHistory } from "@/lib/session-history"
import { resolveThreadSelection } from "@/lib/thread-selection"
import { useHashThreadId } from "@/lib/use-hash-thread-id"
import { GroupedThreadSidebar } from "./grouped-thread-sidebar"
import { ReadonlyAssistantThread } from "./readonly-assistant-thread"
import { SessionConversationTabs } from "./session-conversation-tabs"

type SidebarState = "loading" | "error" | "empty" | "ready"
const SESSION_DETAIL_REFETCH_INTERVAL = 15_000

interface LiveSessionWorkbenchDependencies {
  api: typeof api
  useHashThreadId: typeof useHashThreadId
  sessionDetailRefetchIntervalMs: number
  workbenchDependencies: SessionWorkbenchProps["dependencies"]
}

interface SessionWorkbenchDependencies {
  useSessionHistory: typeof useSessionHistory
  projectReadonlyAssistantThread: typeof projectReadonlyAssistantThread
  ReadonlyAssistantThreadComponent: typeof ReadonlyAssistantThread
}

interface SessionWorkbenchProps {
  sources: ClientSource[]
  sessionsBySource: Record<string, Session[]>
  hashThreadId: string | null
  onSelectThreadId: (threadId: string) => void
  sessionDetail: SessionDetail | null
  sessionDetailError?: Error | null
  onRetrySessionDetail?: () => void
  sidebarState?: SidebarState
  retry?: () => void
  dependencies?: Partial<SessionWorkbenchDependencies>
}

export function SessionWorkbench({
  sources,
  sessionsBySource,
  hashThreadId,
  onSelectThreadId,
  sessionDetail,
  sessionDetailError,
  onRetrySessionDetail,
  sidebarState,
  retry,
  dependencies,
}: SessionWorkbenchProps) {
  const ReadonlyAssistantThreadComponent = dependencies?.ReadonlyAssistantThreadComponent ?? ReadonlyAssistantThread
  const resolvedSelection = useMemo(() => resolveThreadSelection({
    hashThreadId,
    sources,
    sessionsBySource,
  }), [hashThreadId, sources, sessionsBySource])
  const selectedThreadId = resolvedSelection.threadId
  const derivedSidebarState = sidebarState ?? (
    sources.length === 0 ? "empty" : "ready"
  )
  const history = (dependencies?.useSessionHistory ?? useSessionHistory)(selectedThreadId)

  useEffect(() => {
    if (resolvedSelection.shouldWriteHash && selectedThreadId)
      onSelectThreadId(selectedThreadId)
  }, [onSelectThreadId, resolvedSelection.shouldWriteHash, selectedThreadId])

  const selectedSession = useMemo(
    () => resolveSelectedSession(selectedThreadId, sessionsBySource, sessionDetail),
    [selectedThreadId, sessionsBySource, sessionDetail],
  )
  const selectedSource = useMemo(
    () => resolveSelectedSource(sessionDetail, selectedSession, sources),
    [sessionDetail, selectedSession, sources],
  )
  const detailForSelectedThread = useMemo(() => {
    if (!selectedThreadId)
      return null
    if (sessionDetail?.session.thread_id === selectedThreadId)
      return sessionDetail
    if (selectedSession && selectedSource) {
      return {
        session: selectedSession,
        client_source: selectedSource,
        recent_events: history.events,
      }
    }
    return null
  }, [history.events, selectedSession, selectedSource, selectedThreadId, sessionDetail])
  const readonlyThread = useMemo(() => {
    if (!detailForSelectedThread)
      return null
    return (dependencies?.projectReadonlyAssistantThread ?? projectReadonlyAssistantThread)(
      detailForSelectedThread,
      history.events,
    )
  }, [dependencies, detailForSelectedThread, history.events])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside
        className="flex w-72 flex-col border-r"
        aria-label="Client sources"
      >
        <div className="flex items-center justify-between gap-2 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Client sources
          </h2>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <SidebarPane
            state={derivedSidebarState}
            sources={sources}
            sessionsBySource={sessionsBySource}
            selectedThreadId={selectedThreadId}
            onSelectThreadId={onSelectThreadId}
            retry={retry}
          />
        </ScrollArea>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col" aria-label="Session detail">
        <SessionHeader session={selectedSession} source={selectedSource} />
        {selectedThreadId && sessionDetailError && (
          <div className="border-b bg-destructive/5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Could not refresh session detail.
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {sessionDetailError.message}
                </p>
              </div>
              {onRetrySessionDetail && (
                <button
                  type="button"
                  onClick={onRetrySessionDetail}
                  className="shrink-0 rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted"
                >
                  Retry session detail
                </button>
              )}
            </div>
          </div>
        )}
        {selectedThreadId
          ? (
              <SessionConversationTabs
                threadId={selectedThreadId}
                conversation={(
                  <ReadonlyAssistantThreadComponent
                    thread={readonlyThread}
                    status={history.status}
                    error={history.error}
                  />
                )}
                rawEvents={<RawEventTable key={selectedThreadId} events={history.events} />}
                metadata={(
                  <MetadataPanel
                    session={selectedSession}
                    source={selectedSource}
                  />
                )}
              />
            )
          : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Select a session from the left to inspect its conversation and events.
              </div>
            )}
      </main>
    </div>
  )
}

export function LiveSessionWorkbench({
  dependencies,
}: {
  dependencies?: Partial<LiveSessionWorkbenchDependencies>
}) {
  const apiClient = dependencies?.api ?? api
  const [hashThreadId, setHashThreadId] = (dependencies?.useHashThreadId ?? useHashThreadId)()

  const sourcesQuery = useQuery<ClientSource[]>({
    queryKey: ["client-sources"],
    queryFn: apiClient.clientSources,
    refetchInterval: 10_000,
  })

  const sources = useMemo(
    () => sourcesQuery.data ?? [],
    [sourcesQuery.data],
  )
  const sourceKeysFingerprint = useMemo(
    () => sources.map(source => source.source_key).join("|"),
    [sources],
  )

  const sessionsQuery = useQuery<Record<string, Session[]>>({
    queryKey: ["sessions-by-source", sourceKeysFingerprint],
    enabled: sources.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        sources.map(async (source) => {
          const items = await apiClient.sessionsForSource(source.source_key)
          return [source.source_key, items] as const
        }),
      )
      return Object.fromEntries(entries)
    },
    refetchInterval: 15_000,
  })

  const sessionsBySource = useMemo(
    () => sessionsQuery.data ?? {},
    [sessionsQuery.data],
  )
  const resolvedSelection = useMemo(() => resolveThreadSelection({
    hashThreadId,
    sources,
    sessionsBySource,
  }), [hashThreadId, sources, sessionsBySource])

  const sessionQuery = useQuery<SessionDetail>({
    queryKey: ["session", resolvedSelection.threadId],
    enabled: !!resolvedSelection.threadId,
    queryFn: () => apiClient.session(resolvedSelection.threadId as string),
    refetchInterval: dependencies?.sessionDetailRefetchIntervalMs ?? SESSION_DETAIL_REFETCH_INTERVAL,
  })
  const sessionDetailError = sessionQuery.error instanceof Error ? sessionQuery.error : null

  const sidebarState: SidebarState = sourcesQuery.isPending || (sources.length > 0 && sessionsQuery.isPending)
    ? "loading"
    : sourcesQuery.isError || sessionsQuery.isError
      ? "error"
      : sources.length === 0
        ? "empty"
        : "ready"

  return (
    <SessionWorkbench
      sources={sources}
      sessionsBySource={sessionsBySource}
      hashThreadId={hashThreadId}
      onSelectThreadId={setHashThreadId}
      sessionDetail={sessionQuery.data ?? null}
      sessionDetailError={sessionDetailError}
      onRetrySessionDetail={() => {
        void sessionQuery.refetch()
      }}
      sidebarState={sidebarState}
      retry={() => {
        void sourcesQuery.refetch()
        void sessionsQuery.refetch()
        void sessionQuery.refetch()
      }}
      dependencies={dependencies?.workbenchDependencies}
    />
  )
}

interface SidebarPaneProps {
  state: SidebarState
  sources: ClientSource[]
  sessionsBySource: Record<string, Session[]>
  selectedThreadId: string | null
  onSelectThreadId: (threadId: string) => void
  retry?: () => void
}

function SidebarPane({
  state,
  sources,
  sessionsBySource,
  selectedThreadId,
  onSelectThreadId,
  retry,
}: SidebarPaneProps) {
  if (state === "loading") {
    return (
      <ul className="flex flex-col gap-2 p-4" aria-busy="true">
        {["s1", "s2", "s3", "s4"].map(key => (
          <li
            key={key}
            className="h-10 animate-pulse rounded-md bg-muted/60"
          />
        ))}
      </ul>
    )
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm">
        <p className="text-muted-foreground">Could not load client sources.</p>
        {retry && (
          <button
            type="button"
            onClick={retry}
            className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (state === "empty") {
    return (
      <div className="flex flex-col gap-2 p-4 text-sm text-muted-foreground">
        <p>No Codex sessions observed yet.</p>
        <p className="text-xs">
          Launch
          {" "}
          <code className="font-mono">codex-mcp-ui --ui-port …</code>
          {" "}
          from an MCP client and run a turn.
        </p>
      </div>
    )
  }

  return (
    <GroupedThreadSidebar
      sources={sources}
      sessionsBySource={sessionsBySource}
      selectedThreadId={selectedThreadId}
      onSelectThreadId={onSelectThreadId}
    />
  )
}

function resolveSelectedSession(
  threadId: string | null,
  sessionsBySource: Record<string, Session[]>,
  sessionDetail: SessionDetail | null,
) {
  if (!threadId)
    return null

  if (sessionDetail?.session.thread_id === threadId)
    return sessionDetail.session

  for (const sessions of Object.values(sessionsBySource)) {
    const session = sessions.find(item => item.thread_id === threadId)
    if (session)
      return session
  }

  return null
}

function resolveSelectedSource(
  sessionDetail: SessionDetail | null,
  session: Session | null,
  sources: readonly ClientSource[],
) {
  if (
    sessionDetail
    && session
    && sessionDetail.session.thread_id === session.thread_id
  ) {
    return sessionDetail.client_source
  }

  if (!session)
    return null

  return sources.find(source => source.source_key === session.source_key) ?? null
}
