import type { EventRecord } from "./types"
import { fetchEventSource } from "@microsoft/fetch-event-source"

export interface SSEOptions {
  sourceKey?: string
  threadId?: string
  since?: string
  onEvent: (event: EventRecord) => void
  onStatusChange?: (status: "connecting" | "live" | "disconnected") => void
  onParseError?: (err: unknown) => void
}

export function buildStreamURL(opts: Pick<SSEOptions, "sourceKey" | "threadId" | "since">): string {
  const qs = new URLSearchParams()
  if (opts.sourceKey)
    qs.set("source_key", opts.sourceKey)
  if (opts.threadId)
    qs.set("thread_id", opts.threadId)
  if (opts.since)
    qs.set("since", opts.since)
  return `/api/v1/stream${qs.size > 0 ? `?${qs.toString()}` : ""}`
}

export function subscribeEvents(opts: SSEOptions): () => void {
  const controller = new AbortController()
  const url = buildStreamURL(opts)
  opts.onStatusChange?.("connecting")

  void fetchEventSource(url, {
    signal: controller.signal,
    onopen: async () => {
      opts.onStatusChange?.("live")
    },
    onmessage(msg) {
      if (!msg.data)
        return
      try {
        const parsed = JSON.parse(msg.data) as EventRecord
        opts.onEvent(parsed)
      }
      catch (err) {
        opts.onParseError?.(err)
      }
    },
    onclose() {
      opts.onStatusChange?.("disconnected")
    },
    onerror() {
      opts.onStatusChange?.("disconnected")
      // Let the library keep retrying with backoff; do not throw — throwing
      // here aborts reconnection entirely.
    },
    openWhenHidden: true,
  })

  return () => {
    controller.abort()
    opts.onStatusChange?.("disconnected")
  }
}
