import type { ReactNode } from "react"
import type { EventRecord } from "@/lib/types"
import { AlertCircle, AlertTriangle, Info } from "lucide-react"
import { useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, truncate } from "@/lib/utils"
import { HighlightedCode, MessageBlock } from "./message-block"

interface MilestoneTimelineProps {
  events: EventRecord[]
}

type MilestoneKind
  = | "session"
    | "turn"
    | "exec"
    | "approval"
    | "tool"
    | "mcp_server"
    | "plan"
    | "agent"
    | "reasoning"
    | "user"
    | "diff"
    | "tokens"
    | "resource"
    | "prompt"
    | "sampling"
    | "notification"
    | "search"
    | "image"
    | "patch"
    | "model"
    | "hook"
    | "warning"
    | "error"
    | "other"

interface Milestone {
  key: string
  timestamp: string
  title: string
  kind: MilestoneKind
  // Compact summary chips shown on the card header row.
  chips?: Chip[]
  // Rich body rendered below the title.
  body?: ReactNode
  // Raw payload kept so the user can drill in via the Raw events tab.
  raw?: unknown
}

interface Chip {
  label: string
  tone?: "default" | "ok" | "warn" | "error"
}

const KIND_CLASSES: Record<MilestoneKind, string> = {
  session: "border-l-sky-500",
  turn: "border-l-violet-500",
  exec: "border-l-emerald-600",
  approval: "border-l-amber-500",
  tool: "border-l-indigo-500",
  mcp_server: "border-l-cyan-500",
  plan: "border-l-fuchsia-500",
  agent: "border-l-slate-500",
  reasoning: "border-l-slate-400",
  user: "border-l-slate-600",
  diff: "border-l-teal-500",
  tokens: "border-l-lime-600",
  resource: "border-l-blue-500",
  prompt: "border-l-pink-500",
  sampling: "border-l-purple-500",
  notification: "border-l-zinc-500",
  search: "border-l-blue-600",
  image: "border-l-rose-500",
  patch: "border-l-teal-600",
  model: "border-l-purple-600",
  hook: "border-l-stone-500",
  warning: "border-l-amber-500",
  error: "border-l-red-500",
  other: "border-l-zinc-300",
}

// HIDDEN_EVENT_TYPES are silently dropped from the milestone timeline —
// either because they duplicate other events (item_started/item_completed
// wrap legacy events like web_search_begin), because they are internal
// mechanics the user never asked to inspect (collab_*, hook_*), or because
// the raw JSON lives in the Raw events tab already (raw_response_item,
// metadata query responses).
const HIDDEN_EVENT_TYPES = new Set<string>([
  "raw_response_item",
  "thread_name_updated",
  "item_started",
  "item_completed",
  "hook_started",
  "hook_completed",
  "skills_update_available",
  "mcp_list_tools_response",
  "list_skills_response",
  "get_history_entry_response",
  "realtime_conversation_started",
  "realtime_conversation_realtime",
  "realtime_conversation_closed",
  "realtime_conversation_sdp",
  "realtime_conversation_list_voices_response",
  "collab_agent_spawn_begin",
  "collab_agent_spawn_end",
  "collab_agent_interaction_begin",
  "collab_agent_interaction_end",
  "collab_waiting_begin",
  "collab_waiting_end",
  "collab_close_begin",
  "collab_close_end",
  "collab_resume_begin",
  "collab_resume_end",
])

// ---------- payload helpers ----------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

// msgOf normalizes the three payload shapes we see:
//   1. codex/event frames wrap fields inside params.msg
//   2. MCP JSON-RPC methods put fields inside params
//   3. Test fixtures put fields at the top level
// Returning the most specific non-empty object keeps each renderer simple.
function msgOf(evt: EventRecord): Record<string, unknown> {
  const p = asRecord(evt.payload)
  const params = asRecord(p.params)
  if (params.msg && typeof params.msg === "object") {
    return params.msg as Record<string, unknown>
  }
  if (Object.keys(params).length > 0)
    return params
  return p
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key]
  return typeof v === "string" && v.length > 0 ? v : undefined
}

function num(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key]
  return typeof v === "number" ? v : undefined
}

function list(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key]
  return Array.isArray(v) ? v : []
}

// base64DecodeUtf8 handles exec_command_output_delta chunks. Real Codex
// traffic ships chunks as standard base64; fixtures and ad-hoc payloads
// pass through as plain text. atob happily "decodes" short plain-text that
// coincidentally matches the base64 alphabet, so we fall back to raw when
// the bytes don't round-trip as valid UTF-8.
function base64DecodeUtf8(raw: string): string {
  if (!raw)
    return ""
  try {
    const bin = atob(raw)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++)
      bytes[i] = bin.charCodeAt(i)
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  }
  catch {
    return raw
  }
}

// ---------- small presentational primitives ----------

function ChipRow({ chips }: { chips: Chip[] }) {
  if (!chips.length)
    return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <Badge
          key={i}
          variant={c.tone === "error" ? "destructive" : "secondary"}
          className={cn(
            "font-mono text-[10px] font-normal",
            c.tone === "ok" && "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
            c.tone === "warn" && "bg-amber-100 text-amber-900 hover:bg-amber-100",
          )}
        >
          {c.label}
        </Badge>
      ))}
    </div>
  )
}

function KVRow({ items }: { items: Array<[string, ReactNode]> }) {
  if (!items.length)
    return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all font-mono text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Prose({ children }: { children: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {children}
    </p>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-xs text-foreground">
      {children}
    </pre>
  )
}

// ---------- per-type milestone builders ----------

function sessionConfigured(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const chips: Chip[] = []
  if (str(m, "model"))
    chips.push({ label: str(m, "model")! })
  if (str(m, "approval_policy"))
    chips.push({ label: `approval: ${str(m, "approval_policy")}` })
  const sb = asRecord(m.sandbox_policy)
  if (str(sb, "type") || str(m, "sandbox"))
    chips.push({ label: `sandbox: ${str(sb, "type") ?? str(m, "sandbox")}` })
  const kv: Array<[string, ReactNode]> = []
  if (str(m, "cwd"))
    kv.push(["cwd", str(m, "cwd")])
  if (str(m, "model_provider_id"))
    kv.push(["provider", str(m, "model_provider_id")])
  if (str(m, "reasoning_effort"))
    kv.push(["reasoning", str(m, "reasoning_effort")])
  if (num(m, "history_entry_count") != null)
    kv.push(["history", String(num(m, "history_entry_count"))])
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Session configured",
    kind: "session",
    chips,
    body: kv.length ? <KVRow items={kv} /> : undefined,
    raw: evt.payload,
  }
}

function turnStarted(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const chips: Chip[] = []
  if (str(m, "turn_id"))
    chips.push({ label: `turn ${str(m, "turn_id")}` })
  if (num(m, "model_context_window") != null)
    chips.push({ label: `ctx ${num(m, "model_context_window")}` })
  if (str(m, "collaboration_mode_kind"))
    chips.push({ label: String(m.collaboration_mode_kind) })
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Turn started",
    kind: "turn",
    chips,
    raw: evt.payload,
  }
}

function turnComplete(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const chips: Chip[] = []
  if (str(m, "turn_id"))
    chips.push({ label: `turn ${str(m, "turn_id")}` })
  if (num(m, "duration_ms") != null)
    chips.push({ label: `${num(m, "duration_ms")}ms` })
  const last = str(m, "last_agent_message")
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Turn complete",
    kind: "turn",
    chips,
    body: last ? <Prose>{truncate(last, 500)}</Prose> : undefined,
    raw: evt.payload,
  }
}

function turnAborted(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const reason = str(m, "reason") ?? "aborted"
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: `Turn aborted: ${reason}`,
    kind: "error",
    chips: str(m, "turn_id") ? [{ label: `turn ${str(m, "turn_id")}` }] : [],
    raw: evt.payload,
  }
}

function agentMessage(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const text = str(m, "message") ?? ""
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Agent message",
    kind: "agent",
    body: text
      ? (
          <MessageBlock
            role="agent"
            text={text}
            timestamp={evt.timestamp}
            annotation={str(m, "phase")}
          />
        )
      : undefined,
    raw: evt.payload,
  }
}

function userMessage(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const text = str(m, "message") ?? ""
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "User message",
    kind: "user",
    body: text
      ? <MessageBlock role="user" text={text} timestamp={evt.timestamp} />
      : undefined,
    raw: evt.payload,
  }
}

function agentReasoning(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const text = str(m, "text") ?? ""
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Reasoning",
    kind: "reasoning",
    body: text
      ? <MessageBlock role="reasoning" text={text} timestamp={evt.timestamp} />
      : undefined,
    raw: evt.payload,
  }
}

function tokenCount(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const info = asRecord(m.info)
  const last = asRecord(info.last_token_usage)
  const total = asRecord(info.total_token_usage)
  const chips: Chip[] = []
  if (num(last, "input_tokens") != null || num(last, "output_tokens") != null) {
    chips.push({
      label: `in ${num(last, "input_tokens") ?? 0} / out ${num(last, "output_tokens") ?? 0}`,
    })
  }
  if (num(total, "input_tokens") != null || num(total, "output_tokens") != null) {
    chips.push({
      label: `total in ${num(total, "input_tokens") ?? 0} / out ${num(total, "output_tokens") ?? 0}`,
    })
  }
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Token count",
    kind: "tokens",
    chips,
    raw: evt.payload,
  }
}

function turnDiff(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const diff = str(m, "unified_diff") ?? ""
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Turn diff",
    kind: "diff",
    body: diff ? <CodeBlock>{truncate(diff, 4000)}</CodeBlock> : undefined,
    raw: evt.payload,
  }
}

function planUpdate(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const plan = list(m, "plan")
  const items = plan.map((step, i) => {
    const s = asRecord(step)
    const status = str(s, "status") ?? "pending"
    const text = str(s, "step") ?? str(s, "summary") ?? ""
    return (
      <li key={i} className="flex items-start gap-2 text-sm">
        <span
          className={cn(
            "mt-1 inline-block h-2 w-2 rounded-full",
            status === "completed" && "bg-emerald-500",
            status === "in_progress" && "bg-amber-500",
            status === "pending" && "bg-zinc-300",
          )}
        />
        <span className={cn(status === "completed" && "line-through text-muted-foreground")}>
          {text || "(empty step)"}
        </span>
      </li>
    )
  })
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: evt.event_type === "plan_delta" ? "Plan delta" : "Plan update",
    kind: "plan",
    chips: str(m, "explanation") ? [{ label: String(m.explanation) }] : [],
    body: items.length ? <ul className="space-y-1">{items}</ul> : undefined,
    raw: evt.payload,
  }
}

function backgroundEvent(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const message = str(m, "message") ?? ""
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Background",
    kind: "notification",
    body: message ? <Prose>{truncate(message, 800)}</Prose> : undefined,
    raw: evt.payload,
  }
}

function streamError(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const message = str(m, "message") ?? "stream error"
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Stream error",
    kind: "error",
    body: <Prose>{message}</Prose>,
    raw: evt.payload,
  }
}

function errorEvent(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const message = str(m, "message") ?? "error"
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Error",
    kind: "error",
    body: <Prose>{truncate(message, 1200)}</Prose>,
    raw: evt.payload,
  }
}

function warningEvent(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const message = str(m, "message") ?? "warning"
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Warning",
    kind: "warning",
    body: <Prose>{truncate(message, 800)}</Prose>,
    raw: evt.payload,
  }
}

function modelReroute(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const from = str(m, "from_model") ?? "?"
  const to = str(m, "to_model") ?? "?"
  const reason = str(m, "reason")
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: `Model rerouted: ${from} → ${to}`,
    kind: "model",
    chips: reason ? [{ label: reason, tone: "warn" }] : [],
    raw: evt.payload,
  }
}

function contextCompacted(evt: EventRecord): Milestone {
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "Context compacted",
    kind: "notification",
    raw: evt.payload,
  }
}

function threadRolledBack(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const n = num(m, "num_turns") ?? 0
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: `Thread rolled back (${n} turn${n === 1 ? "" : "s"})`,
    kind: "notification",
    raw: evt.payload,
  }
}

function deprecationNotice(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const summary = str(m, "summary") ?? "deprecation"
  const details = str(m, "details")
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: `Deprecated: ${summary}`,
    kind: "warning",
    body: details ? <Prose>{details}</Prose> : undefined,
    raw: evt.payload,
  }
}

function undoEvent(evt: EventRecord, kind: "started" | "completed"): Milestone {
  const m = msgOf(evt)
  const message = str(m, "message")
  const success = m.success === true || m.success === undefined
  const chips: Chip[] = []
  if (kind === "completed") {
    chips.push({ label: success ? "ok" : "failed", tone: success ? "ok" : "error" })
  }
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: kind === "started" ? "Undo started" : "Undo completed",
    kind: "notification",
    chips,
    body: message ? <Prose>{message}</Prose> : undefined,
    raw: evt.payload,
  }
}

function viewImageToolCall(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const path = str(m, "path") ?? "?"
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: "View image",
    kind: "image",
    body: <KVRow items={[["path", path]]} />,
    raw: evt.payload,
  }
}

function simpleNotice(evt: EventRecord, title: string, kind: MilestoneKind = "notification"): Milestone {
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title,
    kind,
    raw: evt.payload,
  }
}

function guardianAssessment(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const verdict = str(m, "verdict") ?? str(m, "status") ?? "assessed"
  const reason = str(m, "reason")
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: `Guardian: ${verdict}`,
    kind: "approval",
    body: reason ? <Prose>{reason}</Prose> : undefined,
    raw: evt.payload,
  }
}

function approvalRequest(evt: EventRecord): Milestone {
  const m = msgOf(evt)
  const cmd = list(m, "command").join(" ")
  const reason = str(m, "reason")
  const kv: Array<[string, ReactNode]> = []
  if (cmd)
    kv.push(["command", cmd])
  if (str(m, "cwd"))
    kv.push(["cwd", str(m, "cwd")])
  if (reason)
    kv.push(["reason", reason])
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: `Approval: ${evt.event_type ?? "unknown"}`,
    kind: "approval",
    body: kv.length ? <KVRow items={kv} /> : undefined,
    raw: evt.payload,
  }
}

// MCP JSON-RPC method milestone (runs for upstream/downstream frames that
// aren't codex/event notifications).
function mcpMethodMilestone(evt: EventRecord): Milestone | null {
  const method = evt.event_type
  if (!method)
    return null
  const params = asRecord(asRecord(evt.payload).params)
  const base: Pick<Milestone, "key" | "timestamp" | "raw"> = {
    key: evt.event_id,
    timestamp: evt.timestamp,
    raw: evt.payload,
  }
  if (method === "initialize") {
    const ci = asRecord(params.clientInfo)
    const chips: Chip[] = []
    if (str(ci, "name"))
      chips.push({ label: `${str(ci, "name")} ${str(ci, "version") ?? ""}`.trim() })
    if (str(params, "protocolVersion"))
      chips.push({ label: `mcp ${str(params, "protocolVersion")}` })
    return { ...base, title: "MCP initialize", kind: "session", chips }
  }
  if (method === "ping")
    return { ...base, title: "ping", kind: "other" }
  if (method.startsWith("notifications/"))
    return { ...base, title: method, kind: "notification" }
  if (method.startsWith("sampling/"))
    return { ...base, title: method, kind: "sampling" }
  if (method.startsWith("tools/")) {
    const name = str(params, "name")
    const suffix = method === "tools/call" && name ? `: ${name}` : ""
    return { ...base, title: `${method}${suffix}`, kind: "tool" }
  }
  if (method.startsWith("resources/")) {
    const target = str(params, "uri") ?? str(params, "name")
    return { ...base, title: `${method}${target ? `: ${target}` : ""}`, kind: "resource" }
  }
  if (method.startsWith("prompts/")) {
    const name = str(params, "name")
    return { ...base, title: `${method}${name ? `: ${name}` : ""}`, kind: "prompt" }
  }
  if (method === "roots/list")
    return { ...base, title: method, kind: "resource" }
  if (method === "completion/complete")
    return { ...base, title: method, kind: "sampling" }
  if (method === "logging/setLevel")
    return { ...base, title: method, kind: "notification" }
  return null
}

function fallbackMilestone(evt: EventRecord): Milestone | null {
  // Responses / raw frames are intentionally hidden here — they live in
  // the Raw events tab. Noise at this layer makes the timeline unusable.
  if (evt.category === "response" || evt.category === "raw_frame")
    return null
  return {
    key: evt.event_id,
    timestamp: evt.timestamp,
    title: evt.event_type ?? evt.category ?? "event",
    kind: evt.category === "error" ? "error" : "other",
    raw: evt.payload,
  }
}

// ---------- exec_command_* aggregation ----------

interface ExecBucket {
  begin?: EventRecord
  outputs: EventRecord[]
  end?: EventRecord
}

function execMilestone(id: string, bucket: ExecBucket): Milestone | null {
  const anchor = bucket.begin ?? bucket.end ?? bucket.outputs[0]
  if (!anchor)
    return null
  const beginMsg = bucket.begin ? msgOf(bucket.begin) : {}
  const endMsg = bucket.end ? msgOf(bucket.end) : {}
  const cmd = list(beginMsg, "command").concat(list(endMsg, "command"))
  const cmdStr = cmd.length ? cmd.join(" ") : ""
  const cwd = str(beginMsg, "cwd") ?? str(endMsg, "cwd")
  const exitCode
    = num(endMsg, "exit_code") ?? num(asRecord(bucket.end?.payload), "exit_code")
  const status = str(endMsg, "status")
  const duration = str(endMsg, "duration")

  // Reconstruct streamed output. Real frames ship base64 bytes; fixtures
  // ship a plain string — base64DecodeUtf8 transparently handles both.
  const streamedParts: string[] = []
  for (const o of bucket.outputs) {
    const om = msgOf(o)
    const chunk = str(om, "chunk") ?? str(asRecord(o.payload), "chunk") ?? ""
    streamedParts.push(base64DecodeUtf8(chunk))
  }
  const streamed = streamedParts.join("")
  const stdout = str(endMsg, "stdout") ?? ""
  const stderr = str(endMsg, "stderr") ?? ""
  const combined = stdout || stderr
    ? [stdout && `--- stdout ---\n${stdout}`, stderr && `--- stderr ---\n${stderr}`]
        .filter(Boolean)
        .join("\n")
    : streamed.trim()

  const chips: Chip[] = []
  if (exitCode != null) {
    chips.push({
      label: `exit=${exitCode}`,
      tone: exitCode === 0 ? "ok" : "error",
    })
  }
  if (status)
    chips.push({ label: status, tone: status === "completed" ? "ok" : "warn" })
  if (duration)
    chips.push({ label: duration })

  const kv: Array<[string, ReactNode]> = []
  if (cmdStr)
    kv.push(["$", <code key="cmd" className="font-mono">{cmdStr}</code>])
  if (cwd)
    kv.push(["cwd", cwd])

  return {
    key: `exec-${id}`,
    timestamp: anchor.timestamp,
    title: `Command ${id}`,
    kind: "exec",
    chips,
    body: (
      <div className="flex flex-col gap-2">
        {kv.length > 0 && <KVRow items={kv} />}
        {combined && <CodeBlock>{truncate(combined, 4000)}</CodeBlock>}
        {!combined && !kv.length && (
          <span className="text-xs text-muted-foreground">(no output)</span>
        )}
      </div>
    ),
    raw: {
      begin: bucket.begin?.payload,
      end: bucket.end?.payload,
      outputs: bucket.outputs.length,
    },
  }
}

// ---------- mcp_tool_call_* aggregation ----------

interface MCPCallBucket {
  begin?: EventRecord
  end?: EventRecord
}

function mcpCallMilestone(id: string, bucket: MCPCallBucket): Milestone | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMsg = bucket.begin ? msgOf(bucket.begin) : {}
  const endMsg = bucket.end ? msgOf(bucket.end) : {}
  const inv
    = asRecord(beginMsg.invocation) || asRecord(endMsg.invocation) || {}
  const server = str(inv as Record<string, unknown>, "server") ?? "?"
  const tool = str(inv as Record<string, unknown>, "tool") ?? "?"
  const chips: Chip[] = []
  if (str(endMsg, "duration"))
    chips.push({ label: String(endMsg.duration) })
  const result = endMsg.result
  const success
    = result && typeof result === "object" && "Ok" in (result as Record<string, unknown>)
  if (bucket.end)
    chips.push({ label: success ? "ok" : "failed", tone: success ? "ok" : "error" })

  const args = (inv as Record<string, unknown>).arguments
  const body: ReactNode | undefined = args
    ? <CodeBlock>{truncate(JSON.stringify(args, null, 2), 2000)}</CodeBlock>
    : undefined

  return {
    key: `mcpcall-${id}`,
    timestamp: anchor.timestamp,
    title: `MCP tool: ${server}.${tool}`,
    kind: "tool",
    chips,
    body,
    raw: { begin: bucket.begin?.payload, end: bucket.end?.payload },
  }
}

// ---------- mcp_startup collapse ----------

interface ServerStart {
  server: string
  updates: Array<{ state: string, timestamp: string, error?: string }>
}

// ---------- web_search / image_generation / patch_apply / dynamic_tool_call buckets ----------

interface PairBucket {
  begin?: EventRecord
  end?: EventRecord
}

function webSearchMilestone(id: string, bucket: PairBucket): Milestone | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const endMsg = bucket.end ? msgOf(bucket.end) : {}
  const query = str(endMsg, "query")
  const action = asRecord(endMsg.action)
  const actionType = str(action, "type")
  return {
    key: `websearch-${id}`,
    timestamp: anchor.timestamp,
    title: "Web search",
    kind: "search",
    chips: actionType ? [{ label: actionType }] : [],
    body: query ? <KVRow items={[["query", query]]} /> : undefined,
    raw: { begin: bucket.begin?.payload, end: bucket.end?.payload },
  }
}

function imageGenerationMilestone(id: string, bucket: PairBucket): Milestone | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const chips: Chip[] = []
  if (bucket.end)
    chips.push({ label: "done", tone: "ok" })
  return {
    key: `imggen-${id}`,
    timestamp: anchor.timestamp,
    title: "Image generation",
    kind: "image",
    chips,
    raw: { begin: bucket.begin?.payload, end: bucket.end?.payload },
  }
}

function dynamicToolCallMilestone(id: string, bucket: PairBucket): Milestone | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMsg = bucket.begin ? msgOf(bucket.begin) : {}
  const endMsg = bucket.end ? msgOf(bucket.end) : {}
  const tool = str(endMsg, "tool") ?? str(beginMsg, "tool") ?? "?"
  const success = bucket.end ? endMsg.success === true : undefined
  const error = str(endMsg, "error")
  const duration = str(endMsg, "duration")
  const args = beginMsg.arguments ?? endMsg.arguments
  const chips: Chip[] = []
  if (success !== undefined)
    chips.push({ label: success ? "ok" : "failed", tone: success ? "ok" : "error" })
  if (duration)
    chips.push({ label: duration })
  const body: ReactNode | undefined = args
    ? <CodeBlock>{truncate(JSON.stringify(args, null, 2), 2000)}</CodeBlock>
    : error
      ? <Prose>{error}</Prose>
      : undefined
  return {
    key: `dyn-${id}`,
    timestamp: anchor.timestamp,
    title: `Dynamic tool: ${tool}`,
    kind: "tool",
    chips,
    body,
    raw: { begin: bucket.begin?.payload, end: bucket.end?.payload },
  }
}

interface PatchBucket extends PairBucket {}

function patchApplyMilestone(id: string, bucket: PatchBucket): Milestone | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMsg = bucket.begin ? msgOf(bucket.begin) : {}
  const endMsg = bucket.end ? msgOf(bucket.end) : {}
  const changes = asRecord(beginMsg.changes)
  const files = Object.keys(changes)
  const autoApproved = beginMsg.auto_approved === true
  const success = bucket.end ? endMsg.success === true : undefined
  const stdout = str(endMsg, "stdout")
  const stderr = str(endMsg, "stderr")
  const chips: Chip[] = []
  if (success !== undefined)
    chips.push({ label: success ? "applied" : "failed", tone: success ? "ok" : "error" })
  if (autoApproved)
    chips.push({ label: "auto-approved" })
  const output = [stderr && `--- stderr ---\n${stderr}`, stdout && `--- stdout ---\n${stdout}`]
    .filter(Boolean)
    .join("\n")
  return {
    key: `patch-${id}`,
    timestamp: anchor.timestamp,
    title: `Patch apply (${files.length} file${files.length === 1 ? "" : "s"})`,
    kind: "patch",
    chips,
    body: (
      <div className="flex flex-col gap-2">
        {files.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs">
            {files.map(f => (
              <li key={f} className="break-all font-mono text-muted-foreground">
                {f}
              </li>
            ))}
          </ul>
        )}
        {output && <CodeBlock>{truncate(output, 2000)}</CodeBlock>}
      </div>
    ),
    raw: { begin: bucket.begin?.payload, end: bucket.end?.payload },
  }
}

function mcpStartupMilestone(
  bucket: Map<string, ServerStart>,
  firstEventId: string,
  firstTimestamp: string,
): Milestone | null {
  if (bucket.size === 0)
    return null
  const servers = Array.from(bucket.values())
  const chips: Chip[] = servers.map((s) => {
    const last = s.updates[s.updates.length - 1]
    const tone = last.state === "ready" ? "ok" : last.state === "failed" ? "error" : "warn"
    return { label: `${s.server}: ${last.state}`, tone }
  })
  return {
    key: `mcp-startup-${firstEventId}`,
    timestamp: firstTimestamp,
    title: "MCP servers startup",
    kind: "mcp_server",
    chips,
  }
}

// ---------- streaming delta aggregation ----------
//
// Codex ships agent text in many delta frames (agent_message_delta,
// agent_message_content_delta) followed — if the turn completes — by a
// terminal agent_message carrying the full string. The same pattern applies
// to reasoning. We bucket deltas by turn_id and drop the bucket if the
// terminal frame arrives, otherwise emit a "streaming" milestone so live
// turns still show their in-flight text.

type StreamKind = "message" | "reasoning"

interface StreamBucket {
  anchorEventId: string
  anchorTimestamp: string
  parts: string[]
  terminated: boolean
}

function streamingMilestone(
  key: string,
  kind: StreamKind,
  bucket: StreamBucket,
): Milestone | null {
  if (bucket.terminated)
    return null
  const text = bucket.parts.join("")
  if (!text)
    return null
  const role = kind === "message" ? "agent" : "reasoning"
  return {
    key: `stream-${kind}-${key}`,
    timestamp: bucket.anchorTimestamp,
    title: kind === "message" ? "Agent message (streaming)" : "Reasoning (streaming)",
    kind: role,
    body: (
      <MessageBlock
        role={role}
        text={text}
        timestamp={bucket.anchorTimestamp}
        streaming
      />
    ),
  }
}

// ---------- main builder ----------

function buildMilestones(events: EventRecord[]): Milestone[] {
  const out: Milestone[] = []
  const execBuckets = new Map<string, ExecBucket>()
  const mcpCallBuckets = new Map<string, MCPCallBucket>()
  const webSearchBuckets = new Map<string, PairBucket>()
  const imageGenBuckets = new Map<string, PairBucket>()
  const patchBuckets = new Map<string, PatchBucket>()
  const dynCallBuckets = new Map<string, PairBucket>()
  const mcpStartup = new Map<string, ServerStart>()
  const messageStreams = new Map<string, StreamBucket>()
  const reasoningStreams = new Map<string, StreamBucket>()
  let firstStartupId: string | null = null
  let firstStartupTs = ""

  const pairBucketBy = <T extends PairBucket>(
    store: Map<string, T>,
    evt: EventRecord,
    defaultValue: () => T,
  ): [string, T] => {
    const m = msgOf(evt)
    const id = str(m, "call_id") ?? evt.tool_call_id ?? evt.command_call_id ?? evt.event_id
    let b = store.get(id)
    if (!b) {
      b = defaultValue()
      store.set(id, b)
    }
    return [id, b]
  }

  const appendDelta = (
    bucket: Map<string, StreamBucket>,
    evt: EventRecord,
    deltaKey: string = "delta",
  ) => {
    const key = evt.turn_id ?? evt.request_id ?? evt.event_id
    const m = msgOf(evt)
    const text = str(m, deltaKey) ?? ""
    let b = bucket.get(key)
    if (!b) {
      b = {
        anchorEventId: evt.event_id,
        anchorTimestamp: evt.timestamp,
        parts: [],
        terminated: false,
      }
      bucket.set(key, b)
    }
    if (text)
      b.parts.push(text)
  }
  const terminateStream = (
    bucket: Map<string, StreamBucket>,
    evt: EventRecord,
  ) => {
    const key = evt.turn_id ?? evt.request_id ?? evt.event_id
    const b = bucket.get(key)
    if (b)
      b.terminated = true
  }

  const execBucket = (evt: EventRecord) => {
    const id = evt.command_call_id ?? evt.event_id
    let b = execBuckets.get(id)
    if (!b) {
      b = { outputs: [] }
      execBuckets.set(id, b)
    }
    return b
  }
  const mcpBucket = (evt: EventRecord) => {
    const m = msgOf(evt)
    const id = str(m, "call_id") ?? evt.tool_call_id ?? evt.event_id
    let b = mcpCallBuckets.get(id)
    if (!b) {
      b = {}
      mcpCallBuckets.set(id, b)
    }
    return [id, b] as const
  }

  for (const evt of events) {
    if (evt.event_type && HIDDEN_EVENT_TYPES.has(evt.event_type))
      continue
    switch (evt.event_type) {
      case "session_configured":
        out.push(sessionConfigured(evt))
        continue
      case "error":
        out.push(errorEvent(evt))
        continue
      case "warning":
        out.push(warningEvent(evt))
        continue
      case "model_reroute":
        out.push(modelReroute(evt))
        continue
      case "context_compacted":
        out.push(contextCompacted(evt))
        continue
      case "thread_rolled_back":
        out.push(threadRolledBack(evt))
        continue
      case "deprecation_notice":
        out.push(deprecationNotice(evt))
        continue
      case "undo_started":
        out.push(undoEvent(evt, "started"))
        continue
      case "undo_completed":
        out.push(undoEvent(evt, "completed"))
        continue
      case "view_image_tool_call":
        out.push(viewImageToolCall(evt))
        continue
      case "shutdown_complete":
        out.push(simpleNotice(evt, "Shutdown complete"))
        continue
      case "entered_review_mode":
        out.push(simpleNotice(evt, "Entered review mode", "approval"))
        continue
      case "exited_review_mode":
        out.push(simpleNotice(evt, "Exited review mode", "approval"))
        continue
      case "guardian_assessment":
        out.push(guardianAssessment(evt))
        continue
      case "web_search_begin": {
        const [, b] = pairBucketBy(webSearchBuckets, evt, (): PairBucket => ({}))
        b.begin = evt
        continue
      }
      case "web_search_end": {
        const [, b] = pairBucketBy(webSearchBuckets, evt, (): PairBucket => ({}))
        b.end = evt
        continue
      }
      case "image_generation_begin": {
        const [, b] = pairBucketBy(imageGenBuckets, evt, (): PairBucket => ({}))
        b.begin = evt
        continue
      }
      case "image_generation_end": {
        const [, b] = pairBucketBy(imageGenBuckets, evt, (): PairBucket => ({}))
        b.end = evt
        continue
      }
      case "patch_apply_begin": {
        const [, b] = pairBucketBy(patchBuckets, evt, (): PatchBucket => ({}))
        b.begin = evt
        continue
      }
      case "patch_apply_end": {
        const [, b] = pairBucketBy(patchBuckets, evt, (): PatchBucket => ({}))
        b.end = evt
        continue
      }
      case "dynamic_tool_call_request": {
        const [, b] = pairBucketBy(dynCallBuckets, evt, (): PairBucket => ({}))
        b.begin = evt
        continue
      }
      case "dynamic_tool_call_response": {
        const [, b] = pairBucketBy(dynCallBuckets, evt, (): PairBucket => ({}))
        b.end = evt
        continue
      }
      case "task_started":
      case "turn_started":
        out.push(turnStarted(evt))
        continue
      case "task_complete":
      case "turn_complete":
        out.push(turnComplete(evt))
        continue
      case "turn_aborted":
        out.push(turnAborted(evt))
        continue
      case "turn_diff":
        out.push(turnDiff(evt))
        continue
      case "token_count":
        out.push(tokenCount(evt))
        continue
      case "agent_message":
        terminateStream(messageStreams, evt)
        out.push(agentMessage(evt))
        continue
      case "user_message":
        out.push(userMessage(evt))
        continue
      case "agent_reasoning":
      case "agent_reasoning_raw_content":
        terminateStream(reasoningStreams, evt)
        out.push(agentReasoning(evt))
        continue
      case "plan_update":
      case "plan_delta":
        out.push(planUpdate(evt))
        continue
      case "background_event":
        out.push(backgroundEvent(evt))
        continue
      case "stream_error":
        out.push(streamError(evt))
        continue
      case "exec_approval_request":
      case "apply_patch_approval_request":
      case "elicitation_request":
      case "request_permissions":
      case "request_user_input":
        out.push(approvalRequest(evt))
        continue
      case "exec_command_begin":
        execBucket(evt).begin = evt
        continue
      case "exec_command_output_delta":
        execBucket(evt).outputs.push(evt)
        continue
      case "exec_command_end":
        execBucket(evt).end = evt
        continue
      case "mcp_tool_call_begin": {
        const [, b] = mcpBucket(evt)
        b.begin = evt
        continue
      }
      case "mcp_tool_call_end": {
        const [, b] = mcpBucket(evt)
        b.end = evt
        continue
      }
      case "mcp_startup_update": {
        const m = msgOf(evt)
        const server = str(m, "server") ?? "?"
        const status = asRecord(m.status)
        const state = str(status, "state") ?? "unknown"
        const error = str(status, "error")
        if (!firstStartupId) {
          firstStartupId = evt.event_id
          firstStartupTs = evt.timestamp
        }
        const entry = mcpStartup.get(server) ?? { server, updates: [] }
        entry.updates.push({ state, timestamp: evt.timestamp, error })
        mcpStartup.set(server, entry)
        continue
      }
      case "mcp_startup_complete":
        // Subsumed by the collapsed mcp_startup card; skip.
        continue
      // Deltas stream hundreds of frames per turn. Aggregate them by
      // turn_id so the timeline carries a single "streaming" milestone per
      // turn — dropped when the terminal agent_message/reasoning arrives.
      case "agent_message_delta":
      case "agent_message_content_delta":
        appendDelta(messageStreams, evt)
        continue
      case "agent_reasoning_delta":
      case "agent_reasoning_raw_content_delta":
      case "reasoning_content_delta":
      case "reasoning_raw_content_delta":
        appendDelta(reasoningStreams, evt)
        continue
      case "agent_reasoning_section_break":
        continue
    }

    const mcp = mcpMethodMilestone(evt)
    if (mcp) {
      out.push(mcp)
      continue
    }
    const fb = fallbackMilestone(evt)
    if (fb)
      out.push(fb)
  }

  for (const [id, b] of execBuckets) {
    const m = execMilestone(id, b)
    if (m)
      out.push(m)
  }
  for (const [id, b] of mcpCallBuckets) {
    const m = mcpCallMilestone(id, b)
    if (m)
      out.push(m)
  }
  for (const [id, b] of webSearchBuckets) {
    const m = webSearchMilestone(id, b)
    if (m)
      out.push(m)
  }
  for (const [id, b] of imageGenBuckets) {
    const m = imageGenerationMilestone(id, b)
    if (m)
      out.push(m)
  }
  for (const [id, b] of patchBuckets) {
    const m = patchApplyMilestone(id, b)
    if (m)
      out.push(m)
  }
  for (const [id, b] of dynCallBuckets) {
    const m = dynamicToolCallMilestone(id, b)
    if (m)
      out.push(m)
  }
  if (firstStartupId) {
    const m = mcpStartupMilestone(mcpStartup, firstStartupId, firstStartupTs)
    if (m)
      out.push(m)
  }
  for (const [key, b] of messageStreams) {
    const m = streamingMilestone(key, "message", b)
    if (m)
      out.push(m)
  }
  for (const [key, b] of reasoningStreams) {
    const m = streamingMilestone(key, "reasoning", b)
    if (m)
      out.push(m)
  }

  out.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return out
}

// ---------- card shell + raw drawer ----------

function RawToggle({ raw }: { raw: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="self-start text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? "Hide payload" : "Show payload"}
      </button>
      {open && (
        <div className="max-h-80 overflow-auto rounded text-xs">
          <HighlightedCode code={JSON.stringify(raw, null, 2)} language="json" />
        </div>
      )}
    </>
  )
}

function MilestoneCard({ m }: { m: Milestone }) {
  const hasRaw = m.raw !== undefined

  // Conversation-flavored events (agent / user / reasoning) render as a
  // typeset message rather than a generic debug card. MessageBlock supplies
  // its own header so we drop the Card chrome here.
  if (m.kind === "agent" || m.kind === "user" || m.kind === "reasoning") {
    return (
      <div className="flex flex-col gap-1">
        {m.body}
        {hasRaw && (
          <div className="pl-5">
            <RawToggle raw={m.raw} />
          </div>
        )}
      </div>
    )
  }

  // error/warning events get a shadcn Alert — higher visual weight than a
  // regular Card, with the correct ARIA role baked in.
  if (m.kind === "error" || m.kind === "warning") {
    const destructive = m.kind === "error"
    const Icon = destructive ? AlertCircle : AlertTriangle
    return (
      <Alert variant={destructive ? "destructive" : "default"} className={cn(!destructive && "border-amber-500/50")}>
        <Icon />
        <AlertTitle className="flex items-center justify-between gap-3">
          <span>{m.title}</span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {m.timestamp}
          </Badge>
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          {m.chips && m.chips.length > 0 && <ChipRow chips={m.chips} />}
          {m.body}
          {hasRaw && <RawToggle raw={m.raw} />}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className={cn("border-l-4", KIND_CLASSES[m.kind])}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {m.kind === "notification" && <Info className="size-3.5 text-muted-foreground" />}
          {m.title}
        </CardTitle>
        <Badge variant="outline" className="font-mono text-[10px]">
          {m.timestamp}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 py-0 pb-3">
        {m.chips && m.chips.length > 0 && <ChipRow chips={m.chips} />}
        {m.body}
        {hasRaw && <RawToggle raw={m.raw} />}
      </CardContent>
    </Card>
  )
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
          <MilestoneCard m={m} />
        </li>
      ))}
    </ol>
  )
}
