import type { ClientSource, Session } from "@/lib/types"
import { Badge } from "@/components/ui/badge"

interface SessionHeaderProps {
  session: Session | null
  source: ClientSource | null
}

export function SessionHeader({ session, source }: SessionHeaderProps) {
  if (!session || !source) {
    return (
      <header className="border-b p-4">
        <h1 className="text-lg font-semibold">Session detail</h1>
        <p className="text-sm text-muted-foreground">
          Select a session on the left to inspect its live MCP traffic.
        </p>
      </header>
    )
  }
  return (
    <header className="flex items-start justify-between gap-4 border-b p-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">
          {`${source.client_name} | pid ${source.pid}`}
        </h1>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {`thread ${session.thread_id}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {session.model && <Badge variant="secondary">{session.model}</Badge>}
        {session.status && <Badge>{session.status}</Badge>}
      </div>
    </header>
  )
}
