import type { EventRecord } from "@/lib/types"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface RawEventTableProps {
  events: EventRecord[]
}

export function RawEventTable({ events }: RawEventTableProps) {
  const [typeFilter, setTypeFilter] = useState("")
  const [requestFilter, setRequestFilter] = useState("")
  const [turnFilter, setTurnFilter] = useState("")

  const filtered = useMemo(() => {
    const type = typeFilter.trim().toLowerCase()
    const req = requestFilter.trim().toLowerCase()
    const turn = turnFilter.trim().toLowerCase()
    return events.filter((evt) => {
      if (type && !(evt.event_type ?? "").toLowerCase().includes(type)) {
        return false
      }
      if (req && !(evt.request_id ?? "").toLowerCase().includes(req)) {
        return false
      }
      if (turn && !(evt.turn_id ?? "").toLowerCase().includes(turn)) {
        return false
      }
      return true
    })
  }, [events, typeFilter, requestFilter, turnFilter])

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
              <TableHead>Time</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Turn</TableHead>
              <TableHead>Payload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(evt => (
              <TableRow key={evt.event_id}>
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
                <TableCell className="max-w-md truncate font-mono text-xs">
                  {JSON.stringify(evt.payload)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
