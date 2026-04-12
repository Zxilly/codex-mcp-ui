import type { ClientSource, Session } from "@/lib/types"

interface MetadataPanelProps {
  session: Session | null
  source: ClientSource | null
}

function Row({ label, value }: { label: string, value?: string | number }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right font-mono text-xs">
        {value ?? "—"}
      </span>
    </div>
  )
}

export function MetadataPanel({ session, source }: MetadataPanelProps) {
  if (!session || !source) {
    return (
      <div className="text-sm text-muted-foreground">
        No session selected.
      </div>
    )
  }
  return (
    <div className="divide-y">
      <div className="pb-2">
        <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Session
        </h3>
        <Row label="Thread id" value={session.thread_id} />
        <Row label="Model" value={session.model} />
        <Row label="CWD" value={session.cwd} />
        <Row label="Approval policy" value={session.approval_policy} />
        <Row label="Sandbox" value={session.sandbox} />
        <Row label="First seen" value={session.first_seen} />
        <Row label="Last seen" value={session.last_seen} />
      </div>
      <div className="pt-2">
        <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Client source
        </h3>
        <Row label="Client" value={source.client_name} />
        <Row label="PID" value={source.pid} />
        <Row label="Protocol" value={source.protocol_version} />
        <Row label="Executable" value={source.executable} />
        <Row label="CWD" value={source.cwd} />
      </div>
    </div>
  )
}
