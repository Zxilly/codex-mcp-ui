import { useEffect, useRef, useState } from "react"
import { api } from "./api"
import { subscribeEvents } from "./sse"
import type { SSEOptions } from "./sse"
import type { EventRecord, PaginatedEventsResponse } from "./types"

const PAGE_LIMIT = 500
const historyCache = new Map<string, EventRecord[]>()

export type SessionHistoryStatus = "idle" | "loading" | "ready" | "error"

export interface SessionHistoryState {
  events: EventRecord[]
  status: SessionHistoryStatus
  error: Error | null
  refreshKey: number
}

interface InternalSessionHistoryState extends SessionHistoryState {
  threadId: string | null
}

export interface SessionHistoryDependencies {
  eventsPage: (
    threadId: string,
    opts?: { limit?: number, cursor?: string },
  ) => Promise<PaginatedEventsResponse>
  subscribeEvents: (opts: SSEOptions) => () => void
}

export interface LoadSessionHistoryOptions {
  eventsPage?: SessionHistoryDependencies["eventsPage"]
  bufferedEvents?: readonly EventRecord[]
}

function compareEvents(left: EventRecord, right: EventRecord): number {
  const timestampOrder = left.timestamp.localeCompare(right.timestamp)
  if (timestampOrder !== 0)
    return timestampOrder
  return left.event_id.localeCompare(right.event_id)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function sameEventIds(left: readonly EventRecord[], right: readonly EventRecord[]): boolean {
  if (left.length !== right.length)
    return false
  return left.every((event, index) => event.event_id === right[index]?.event_id)
}

function latestEventId(events: readonly EventRecord[]): string | undefined {
  return events.at(-1)?.event_id
}

export function mergeSessionEvents(...collections: readonly EventRecord[][]): EventRecord[] {
  const deduped = new Map<string, EventRecord>()

  for (const events of collections) {
    for (const event of events) {
      if (!deduped.has(event.event_id))
        deduped.set(event.event_id, event)
    }
  }

  return [...deduped.values()].sort(compareEvents)
}

export async function loadSessionHistory(
  threadId: string,
  options: LoadSessionHistoryOptions = {},
): Promise<EventRecord[]> {
  const eventsPage = options.eventsPage ?? api.eventsPage
  const persisted: EventRecord[] = []

  let cursor: string | undefined
  do {
    const page = await eventsPage(threadId, cursor
      ? { limit: PAGE_LIMIT, cursor }
      : { limit: PAGE_LIMIT })
    persisted.push(...page.items)
    cursor = page.next_cursor
  } while (cursor)

  return mergeSessionEvents(persisted, [...(options.bufferedEvents ?? [])])
}

const INITIAL_STATE: InternalSessionHistoryState = {
  threadId: null,
  events: [],
  status: "idle",
  error: null,
  refreshKey: 0,
}

function initialThreadState(
  threadId: string | null,
  refreshKey: number,
): InternalSessionHistoryState {
  if (!threadId) {
    return {
      ...INITIAL_STATE,
      refreshKey,
    }
  }

  return {
    threadId,
    events: historyCache.get(threadId) ?? [],
    status: "loading",
    error: null,
    refreshKey,
  }
}

function publicState(state: InternalSessionHistoryState): SessionHistoryState {
  return {
    events: state.events,
    status: state.status,
    error: state.error,
    refreshKey: state.refreshKey,
  }
}

export function useSessionHistory(
  threadId: string | null,
  deps: Partial<SessionHistoryDependencies> = {},
): SessionHistoryState {
  const [state, setState] = useState<InternalSessionHistoryState>(INITIAL_STATE)
  const refreshCounterRef = useRef(0)
  const eventsRef = useRef<EventRecord[]>([])
  const eventsPageRef = useRef<SessionHistoryDependencies["eventsPage"]>(
    deps.eventsPage ?? api.eventsPage,
  )
  const streamRef = useRef<SessionHistoryDependencies["subscribeEvents"]>(
    deps.subscribeEvents ?? subscribeEvents,
  )

  eventsPageRef.current = deps.eventsPage ?? api.eventsPage
  streamRef.current = deps.subscribeEvents ?? subscribeEvents

  const visibleState = state.threadId === threadId
    ? state
    : initialThreadState(threadId, state.refreshKey)

  useEffect(() => {
    if (!threadId) {
      eventsRef.current = []
      setState(prev => ({
        ...INITIAL_STATE,
        refreshKey: prev.refreshKey,
      }))
      return
    }

    const eventsPage = eventsPageRef.current
    const stream = streamRef.current
    const cachedEvents = historyCache.get(threadId) ?? []
    const replayCursor = latestEventId(cachedEvents)
    const bufferedEvents: EventRecord[] = []
    let handoffComplete = false
    let cancelled = false

    setState(prev => initialThreadState(threadId, prev.refreshKey))
    eventsRef.current = cachedEvents

    const updateEvents = (
      nextEvents: EventRecord[],
      nextStatus: SessionHistoryStatus,
      nextError: Error | null,
    ) => {
      setState((prev) => {
        const previousEvents = prev.threadId === threadId
          ? prev.events
          : historyCache.get(threadId) ?? []
        const changed = !sameEventIds(previousEvents, nextEvents)
        if (changed)
          refreshCounterRef.current += 1
        eventsRef.current = nextEvents
        if (nextEvents.length > 0)
          historyCache.set(threadId, nextEvents)
        else
          historyCache.delete(threadId)

        return {
          threadId,
          events: nextEvents,
          status: nextStatus,
          error: nextError,
          refreshKey: changed ? refreshCounterRef.current : prev.refreshKey,
        }
      })
    }

    const startBackfillLoad = () => {
      void loadSessionHistory(threadId, {
        eventsPage,
        bufferedEvents,
      })
        .then((events) => {
          if (cancelled)
            return
          handoffComplete = true
          updateEvents(
            mergeSessionEvents(cachedEvents, events, bufferedEvents),
            "ready",
            null,
          )
        })
        .catch((error) => {
          if (cancelled)
            return
          handoffComplete = true
          updateEvents(
            mergeSessionEvents(cachedEvents, bufferedEvents),
            "error",
            toError(error),
          )
        })
    }

    const unsubscribe = stream({
      threadId,
      since: replayCursor,
      onEvent: (event) => {
        bufferedEvents.push(event)
        if (!handoffComplete)
          return
        updateEvents(
          mergeSessionEvents(eventsRef.current, [event]),
          "ready",
          null,
        )
      },
      onParseError: (error) => {
        if (cancelled)
          return
        updateEvents(
          mergeSessionEvents(eventsRef.current, bufferedEvents),
          "error",
          toError(error),
        )
      },
    })

    startBackfillLoad()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [threadId])

  return publicState(visibleState)
}
