import type {
  ClientSource,
  EventPage,
  Session,
  SessionDetail,
} from "./types"

const API_BASE = "/api/v1"

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json" },
  })
  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export const api = {
  clientSources: () =>
    getJSON<{ items: ClientSource[] }>("/client-sources").then(r => r.items),
  sessionsForSource: (sourceKey: string) =>
    getJSON<{ items: Session[] }>(
      `/client-sources/${encodeURIComponent(sourceKey)}/sessions`,
    ).then(r => r.items),
  session: (threadId: string) =>
    getJSON<SessionDetail>(`/sessions/${encodeURIComponent(threadId)}`),
  eventsPage: (threadId: string, opts?: { limit?: number, cursor?: string }) => {
    const qs = new URLSearchParams()
    if (opts?.limit)
      qs.set("limit", String(opts.limit))
    if (opts?.cursor)
      qs.set("cursor", opts.cursor)
    const suffix = qs.size > 0 ? `?${qs.toString()}` : ""
    return getJSON<EventPage>(
      `/sessions/${encodeURIComponent(threadId)}/events${suffix}`,
    )
  },
  events: (threadId: string, opts?: { limit?: number, before?: string }) =>
    api.eventsPage(threadId, {
      limit: opts?.limit,
      cursor: opts?.before,
    }).then(r => r.items),
}
