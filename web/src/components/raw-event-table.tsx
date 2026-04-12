import type { EventRecord } from "@/lib/types"
import { Fragment, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, compactPayloadPreview, prettyPayload } from "@/lib/utils"
import { HighlightedCode } from "./message-block"

interface RawEventTableProps {
  events: EventRecord[]
}

export function RawEventTable({ events }: RawEventTableProps) {
  const [typeFilter, setTypeFilter] = useState("")
  const [requestFilter, setRequestFilter] = useState("")
  const [turnFilter, setTurnFilter] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  // Precompute the payload preview for every event once. Without this, each
  // row render would re-stringify its payload on every parent rerender (the
  // table rerenders whenever SSE appends a new event or the filter inputs
  // change), making large sessions scale quadratically with event count.
  const rows = useMemo(
    () => events.map(evt => ({ evt, preview: compactPayloadPreview(evt.payload) })),
    [events],
  )

  const filtered = useMemo(() => {
    const type = typeFilter.trim().toLowerCase()
    const req = requestFilter.trim().toLowerCase()
    const turn = turnFilter.trim().toLowerCase()
    return rows.filter(({ evt }) => {
      if (type && !(evt.event_type ?? "").toLowerCase().includes(type))
        return false
      if (req && !(evt.request_id ?? "").toLowerCase().includes(req))
        return false
      if (turn && !(evt.turn_id ?? "").toLowerCase().includes(turn))
        return false
      return true
    })
  }, [rows, typeFilter, requestFilter, turnFilter])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Event type
          <input
            aria-label="event type"
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Request id
          <input
            aria-label="request id"
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
            value={requestFilter}
            onChange={e => setRequestFilter(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Turn id
          <input
            aria-label="turn id"
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
            value={turnFilter}
            onChange={e => setTurnFilter(e.target.value)}
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]"></TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Turn</TableHead>
              <TableHead>Payload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(({ evt, preview }) => {
              const open = expanded.has(evt.event_id)
              return (
                <Fragment key={evt.event_id}>
                  <TableRow
                    onClick={() => toggle(evt.event_id)}
                    className="cursor-pointer select-none hover:bg-muted/50"
                    aria-expanded={open}
                  >
                    <TableCell className="text-muted-foreground">
                      <span
                        className={cn(
                          "inline-block transition-transform",
                          open && "rotate-90",
                        )}
                        aria-hidden
                      >
                        ›
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {evt.timestamp}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{evt.direction}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {evt.event_type ?? evt.category}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {evt.request_id ?? "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {evt.turn_id ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                      {preview}
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow
                      data-testid={`raw-expand-${evt.event_id}`}
                      className="bg-muted/30 hover:bg-muted/30"
                    >
                      <TableCell colSpan={7} className="p-0">
                        <ExpandedDetail evt={evt} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ExpandedDetail({ evt }: { evt: EventRecord }) {
  const meta: Array<[string, string | undefined]> = [
    ["event_id", evt.event_id],
    ["category", evt.category],
    ["thread_id", evt.thread_id],
    ["source_key", evt.source_key],
    ["proxy_instance_id", evt.proxy_instance_id],
    ["command_call_id", evt.command_call_id],
    ["tool_call_id", evt.tool_call_id],
  ]
  const body = useMemo(() => prettyPayload(evt.payload), [evt.payload])
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {meta
          .filter(([, v]) => v && v.length > 0)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all font-mono">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="max-h-96 overflow-auto rounded text-xs">
        <HighlightedCode code={body} language="json" />
      </div>
    </div>
  )
}
