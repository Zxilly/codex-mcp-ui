export type EventDirection = "upstream_to_codex" | "codex_to_upstream" | "local"

export interface ClientSource {
  source_key: string
  client_name: string
  pid: number
  protocol_version?: string
  executable?: string
  cwd?: string
  first_seen: string
  last_seen: string
  session_count: number
}

export interface Session {
  thread_id: string
  source_key: string
  title?: string
  model?: string
  cwd?: string
  approval_policy?: string
  sandbox?: string
  first_seen: string
  last_seen: string
  status?: string
}

export interface EventRecord {
  event_id: string
  timestamp: string
  proxy_instance_id: string
  source_key: string
  thread_id?: string
  turn_id?: string
  request_id?: string
  direction: EventDirection
  category: string
  event_type?: string
  command_call_id?: string
  tool_call_id?: string
  payload: unknown
}

export interface Handshake {
  hub_version: string
  proxy_instance_id?: string
  api_base: string
  sse_url: string
}

export interface SessionDetail {
  session: Session
  client_source: ClientSource
  recent_events: EventRecord[]
}
