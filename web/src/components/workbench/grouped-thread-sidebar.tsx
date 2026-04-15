import type { ClientSource, Session } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface GroupedThreadSidebarProps {
  sources: ClientSource[]
  sessionsBySource: Record<string, Session[]>
  selectedThreadId: string | null
  onSelectThreadId: (threadId: string) => void
}

export function GroupedThreadSidebar({
  sources,
  sessionsBySource,
  selectedThreadId,
  onSelectThreadId,
}: GroupedThreadSidebarProps) {
  if (sources.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Waiting for registrations...
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3 p-3 text-sm">
      {sources.map((source) => {
        const sessions = sessionsBySource[source.source_key] ?? []
        return (
          <li key={source.source_key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span className="font-medium text-foreground">
                {`${source.client_name} | pid ${source.pid}`}
              </span>
              <Badge variant="outline">{sessions.length}</Badge>
            </div>
            <ul className="flex flex-col gap-1">
              {sessions.map((session) => {
                const active = session.thread_id === selectedThreadId
                const label = session.title?.trim() || session.thread_id
                return (
                  <li key={session.thread_id}>
                    <button
                      type="button"
                      title={session.title ? `${session.title}\n${session.thread_id}` : session.thread_id}
                      onClick={() => onSelectThreadId(session.thread_id)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-md px-2 py-1 text-left hover:bg-accent",
                        active && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="truncate text-xs">{label}</span>
                      {session.title && (
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {session.thread_id}
                        </span>
                      )}
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
