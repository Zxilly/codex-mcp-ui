import type { ClientSource, Session } from "./types"

export interface ThreadSelectionInput {
  hashThreadId: string | null
  sources: ClientSource[]
  sessionsBySource: Record<string, Session[]>
}

export interface ThreadSelectionResult {
  threadId: string | null
  shouldWriteHash: boolean
}

function hasThread(
  sources: readonly ClientSource[],
  sessionsBySource: Record<string, Session[]>,
  threadId: string,
): boolean {
  return sources.some(source =>
    (sessionsBySource[source.source_key] ?? []).some(session => session.thread_id === threadId),
  )
}

function firstAvailableThread(
  sources: readonly ClientSource[],
  sessionsBySource: Record<string, Session[]>,
): string | null {
  for (const source of sources) {
    const first = sessionsBySource[source.source_key]?.[0]
    if (first)
      return first.thread_id
  }
  return null
}

export function resolveThreadSelection({
  hashThreadId,
  sources,
  sessionsBySource,
}: ThreadSelectionInput): ThreadSelectionResult {
  if (hashThreadId && hasThread(sources, sessionsBySource, hashThreadId)) {
    return {
      threadId: hashThreadId,
      shouldWriteHash: false,
    }
  }

  const fallback = firstAvailableThread(sources, sessionsBySource)
  return {
    threadId: fallback,
    shouldWriteHash: !!fallback && fallback !== hashThreadId,
  }
}
