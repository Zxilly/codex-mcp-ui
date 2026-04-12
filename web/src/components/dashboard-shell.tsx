import type { ConnectionState } from "./connection-status"
import type {
  ClientSource,
  EventRecord,
  Session,
  SessionDetail,
} from "@/lib/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { subscribeEvents } from "@/lib/sse"
import { useHashThreadId } from "@/lib/use-hash-thread-id"
import { ClientSourceTree } from "./client-source-tree"
import {

  ConnectionStatus,
} from "./connection-status"
import { MetadataPanel } from "./metadata-panel"
import { MilestoneTimeline } from "./milestone-timeline"
import { RawEventTable } from "./raw-event-table"
import { SessionHeader } from "./session-header"

export function DashboardShell() {
  const queryClient = useQueryClient()
  const [selectedThreadId, setSelectedThreadId] = useHashThreadId()
  const [sseStatus, setSseStatus] = useState<ConnectionState>("disconnected")

  const sourcesQuery = useQuery<ClientSource[]>({
    queryKey: ["client-sources"],
    queryFn: api.clientSources,
    refetchInterval: 10_000,
  })

  const sources = useMemo(
    () => sourcesQuery.data ?? [],
    [sourcesQuery.data],
  )
  const sourceKeysFingerprint = useMemo(
    () => sources.map(s => s.source_key).join("|"),
    [sources],
  )

  const sessionsQueries = useQuery<Record<string, Session[]>>({
    queryKey: ["sessions-by-source", sourceKeysFingerprint],
    enabled: sources.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        sources.map(async (src) => {
          const items = await api.sessionsForSource(src.source_key)
          return [src.source_key, items] as const
        }),
      )
      return Object.fromEntries(entries)
    },
    refetchInterval: 15_000,
  })

  const sessionsBySource = useMemo(
    () => sessionsQueries.data ?? {},
    [sessionsQueries.data],
  )

  useEffect(() => {
    if (selectedThreadId)
      return
    for (const src of sources) {
      const list = sessionsBySource[src.source_key] ?? []
      if (list.length > 0) {
        setSelectedThreadId(list[0].thread_id)
        return
      }
    }
  }, [sources, sessionsBySource, selectedThreadId, setSelectedThreadId])

  const sessionQuery = useQuery<SessionDetail>({
    queryKey: ["session", selectedThreadId],
    enabled: !!selectedThreadId,
    queryFn: () => api.session(selectedThreadId as string),
  })

  const eventsQuery = useQuery<EventRecord[]>({
    queryKey: ["events", selectedThreadId],
    enabled: !!selectedThreadId,
    queryFn: () => api.events(selectedThreadId as string, { limit: 500 }),
  })

  const seenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!selectedThreadId)
      return
    seenRef.current = new Set((eventsQuery.data ?? []).map(e => e.event_id))
    const unsubscribe = subscribeEvents({
      threadId: selectedThreadId,
      onStatusChange: setSseStatus,
      onEvent: (evt) => {
        if (seenRef.current.has(evt.event_id))
          return
        seenRef.current.add(evt.event_id)
        queryClient.setQueryData<EventRecord[]>(
          ["events", selectedThreadId],
          prev => [...(prev ?? []), evt],
        )
      },
    })
    return unsubscribe
  }, [selectedThreadId, eventsQuery.data, queryClient])

  const selectedSession = sessionQuery.data?.session ?? null
  const selectedSource = sessionQuery.data?.client_source ?? null
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data])

  const treeState: TreeState = sourcesQuery.isLoading
    ? "loading"
    : sourcesQuery.isError
      ? "error"
      : sources.length === 0
        ? "empty"
        : "ready"

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
          <ConnectionStatus state={sseStatus} />
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <TreePane
            state={treeState}
            sources={sources}
            sessionsBySource={sessionsBySource}
            selectedThreadId={selectedThreadId}
            onSelectSession={setSelectedThreadId}
            retry={() => sourcesQuery.refetch()}
          />
        </ScrollArea>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col" aria-label="Session detail">
        <SessionHeader session={selectedSession} source={selectedSource} />
        {selectedThreadId
          ? (
              <Tabs defaultValue="milestones" className="flex min-h-0 flex-1 flex-col">
                <div className="px-4 pt-4">
                  <TabsList>
                    <TabsTrigger value="milestones">Milestones</TabsTrigger>
                    <TabsTrigger value="raw">Raw events</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent
                  value="milestones"
                  className="min-h-0 flex-1 overflow-auto px-4 pb-4"
                >
                  <MilestoneTimeline events={events} />
                </TabsContent>
                <TabsContent value="raw" className="min-h-0 flex-1 px-4 pb-4">
                  <RawEventTable events={events} />
                </TabsContent>
                <TabsContent
                  value="metadata"
                  className="min-h-0 flex-1 overflow-auto px-4 pb-4"
                >
                  <MetadataPanel session={selectedSession} source={selectedSource} />
                </TabsContent>
              </Tabs>
            )
          : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Select a session from the left to inspect its timeline and events.
              </div>
            )}
      </main>
    </div>
  )
}

type TreeState = "loading" | "error" | "empty" | "ready"

interface TreePaneProps {
  state: TreeState
  sources: ClientSource[]
  sessionsBySource: Record<string, Session[]>
  selectedThreadId: string | null
  onSelectSession: (id: string) => void
  retry: () => void
}

function TreePane({
  state,
  sources,
  sessionsBySource,
  selectedThreadId,
  onSelectSession,
  retry,
}: TreePaneProps) {
  if (state === "loading") {
    return (
      <ul className="flex flex-col gap-2 p-4" aria-busy="true">
        {["s1", "s2", "s3", "s4"].map(k => (
          <li
            key={k}
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
        <button
          type="button"
          onClick={retry}
          className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted"
        >
          Retry
        </button>
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
    <ClientSourceTree
      sources={sources}
      sessionsBySource={sessionsBySource}
      selectedThreadId={selectedThreadId}
      onSelectSession={onSelectSession}
    />
  )
}
