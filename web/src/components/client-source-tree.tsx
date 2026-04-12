import type { ClientSource, Session } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ClientSourceTreeProps {
  sources: ClientSource[]
  sessionsBySource: Record<string, Session[]>
  selectedThreadId: string | null
  onSelectSession: (threadId: string) => void
}

export function ClientSourceTree({
  sources,
  sessionsBySource,
  selectedThreadId,
  onSelectSession,
}: ClientSourceTreeProps) {
  if (sources.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Waiting for registrations...
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-3 p-3 text-sm">
      {sources.map((src) => {
        const sessions = sessionsBySource[src.source_key] ?? []
        return (
          <li key={src.source_key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span className="font-medium text-foreground">
                {`${src.client_name} | pid ${src.pid}`}
              </span>
              <Badge variant="outline">{sessions.length}</Badge>
            </div>
            <ul className="flex flex-col gap-1">
              {sessions.map((s) => {
                const active = s.thread_id === selectedThreadId
                return (
                  <li key={s.thread_id}>
                    <button
                      type="button"
                      onClick={() => onSelectSession(s.thread_id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-accent",
                        active && "bg-accent text-accent-foreground",
                      )}
                    >
                      {s.thread_id}
                    </button>
                  </li>
                )
              })}
              {sessions.length === 0 && (
                <li className="px-2 text-xs text-muted-foreground">
                  no sessions yet
                </li>
              )}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
