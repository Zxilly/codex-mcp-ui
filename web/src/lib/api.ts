import type {
  ClientSource,
  EventRecord,
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
  events: (threadId: string, opts?: { limit?: number, before?: string }) => {
    const qs = new URLSearchParams()
    if (opts?.limit)
      qs.set("limit", String(opts.limit))
    if (opts?.before)
      qs.set("before", opts.before)
    const suffix = qs.size > 0 ? `?${qs.toString()}` : ""
    return getJSON<{ items: EventRecord[] }>(
      `/sessions/${encodeURIComponent(threadId)}/events${suffix}`,
    ).then(r => r.items)
  },
}
