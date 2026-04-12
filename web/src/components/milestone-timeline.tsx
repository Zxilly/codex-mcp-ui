import type { EventRecord } from "@/lib/types"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface MilestoneTimelineProps {
  events: EventRecord[]
}

type MilestoneKind
  = | "session"
    | "plan"
    | "exec"
    | "approval"
    | "turn"
    | "tool"
    | "resource"
    | "prompt"
    | "sampling"
    | "notification"
    | "error"
    | "other"

interface Milestone {
  key: string
  timestamp: string
  title: string
  detail: string
  kind: MilestoneKind
}

function shortJSON(value: unknown, max = 280): string {
  let s: string
  try {
    s = typeof value === "string" ? value : JSON.stringify(value)
  }
  catch {
    s = String(value)
  }
  if (!s)
    return ""
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function readStringField(
  payload: unknown,
  ...fields: string[]
): string | undefined {
  if (!payload || typeof payload !== "object")
    return undefined
  const params = (payload as { params?: unknown }).params
  if (!params || typeof params !== "object")
    return undefined
  const obj = params as Record<string, unknown>
  for (const f of fields) {
    const v = obj[f]
    if (typeof v === "string" && v.length > 0)
      return v
  }
  return undefined
}

// buildMcpMilestone annotates known MCP spec methods so that, even when we
// don't have a hand-tuned codex_event case for them, the timeline shows a
// meaningful title instead of a raw method string.
function buildMcpMilestone(evt: EventRecord): Milestone | null {
  const method = evt.event_type
  if (!method)
    return null
  const base = {
    key: evt.event_id,
    timestamp: evt.timestamp,
    detail: shortJSON(evt.payload),
  }
  if (method === "initialize")
    return { ...base, title: "MCP initialize", kind: "session" }
  if (method === "ping")
    return { ...base, title: "ping", kind: "other" }
  if (method === "logging/setLevel")
    return { ...base, title: method, kind: "notification" }
  if (method.startsWith("notifications/"))
    return { ...base, title: method, kind: "notification" }
  if (method.startsWith("sampling/"))
    return { ...base, title: method, kind: "sampling" }
  if (method.startsWith("tools/")) {
    const name = readStringField(evt.payload, "name")
    const suffix = method === "tools/call" && name ? `: ${name}` : ""
    return { ...base, title: `${method}${suffix}`, kind: "tool" }
  }
  if (method.startsWith("resources/")) {
    const target = readStringField(evt.payload, "uri", "name")
    const suffix = target ? `: ${target}` : ""
    return { ...base, title: `${method}${suffix}`, kind: "resource" }
  }
  if (method.startsWith("prompts/")) {
    const name = readStringField(evt.payload, "name")
    const suffix = method === "prompts/get" && name ? `: ${name}` : ""
    return { ...base, title: `${method}${suffix}`, kind: "prompt" }
  }
  if (method === "roots/list")
    return { ...base, title: method, kind: "resource" }
  if (method === "completion/complete")
    return { ...base, title: method, kind: "sampling" }
  return null
}

// fallbackMilestone catches anything the curated + MCP branches missed so
// operators still see arbitrary traffic on the timeline. Responses and
// unparseable raw frames are skipped to keep it readable — those live on
// the Raw events tab.
function fallbackMilestone(evt: EventRecord): Milestone | null {
  if (evt.category === "response" || evt.category === "raw_frame")
    return null
  const title = evt.event_type ?? evt.category ?? "event"
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title,
    detail: shortJSON(evt.payload),
    kind: evt.category === "error" ? "error" : "other",
  }
}

function buildMilestones(events: EventRecord[]): Milestone[] {
  const out: Milestone[] = []
  const execBuckets = new Map<
    string,
    { begin?: EventRecord, outputs: EventRecord[], end?: EventRecord }
  >()
  const bucketFor = (evt: EventRecord) => {
    const id = evt.command_call_id ?? evt.event_id
    let bucket = execBuckets.get(id)
    if (!bucket) {
      bucket = { outputs: [] }
      execBuckets.set(id, bucket)
    }
    return bucket
  }

  for (const evt of events) {
    switch (evt.event_type) {
      case "session_configured":
        out.push({
          key: evt.event_id,
          timestamp: evt.timestamp,
          title: "Session configured",
          detail: JSON.stringify(evt.payload),
          kind: "session",
        })
        break
      case "plan_delta":
      case "plan_update":
        out.push({
          key: evt.event_id,
          timestamp: evt.timestamp,
          title: evt.event_type === "plan_update" ? "Plan update" : "Plan delta",
          detail: JSON.stringify(evt.payload),
          kind: "plan",
        })
        break
      case "exec_command_begin":
        bucketFor(evt).begin = evt
        break
      case "exec_command_output_delta":
        bucketFor(evt).outputs.push(evt)
        break
      case "exec_command_end":
        bucketFor(evt).end = evt
        break
      case "exec_approval_request":
      case "apply_patch_approval_request":
      case "elicitation_request":
      case "request_permissions":
      case "request_user_input":
        out.push({
          key: evt.event_id,
          timestamp: evt.timestamp,
          title: `Approval: ${evt.event_type ?? "unknown"}`,
          detail: JSON.stringify(evt.payload),
          kind: "approval",
        })
        break
      case "task_complete":
      case "turn_complete":
        out.push({
          key: evt.event_id,
          timestamp: evt.timestamp,
          title: "Turn complete",
          detail: JSON.stringify(evt.payload),
          kind: "turn",
        })
        break
      default: {
        const mcp = buildMcpMilestone(evt)
        if (mcp) {
          out.push(mcp)
          break
        }
        const fb = fallbackMilestone(evt)
        if (fb)
          out.push(fb)
        break
      }
    }
  }

  for (const [id, bucket] of execBuckets) {
    const anchor = bucket.begin ?? bucket.end ?? bucket.outputs[0]
    if (!anchor)
      continue
    const chunks = bucket.outputs
      .map((o) => {
        const p = o.payload as { chunk?: string }
        return p.chunk ?? ""
      })
      .join("")
    const exit = (bucket.end?.payload as { exit_code?: number } | undefined)
      ?.exit_code
    out.push({
      key: `exec-${id}`,
      timestamp: anchor.timestamp,
      title: `Command ${id}`,
      detail: `${chunks.trim() || "(no output)"}${
        exit != null ? `\nexit=${exit}` : ""
      }`,
      kind: "exec",
    })
  }

  out.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return out
}

export function MilestoneTimeline({ events }: MilestoneTimelineProps) {
  const milestones = useMemo(() => buildMilestones(events), [events])
  if (milestones.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Nothing recorded yet for this session.
      </div>
    )
  }
  return (
    <ol className="flex flex-col gap-3">
      {milestones.map(m => (
        <li key={m.key}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
              <CardTitle className="text-sm">{m.title}</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {m.timestamp}
              </Badge>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                {m.detail}
              </pre>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  )
}
