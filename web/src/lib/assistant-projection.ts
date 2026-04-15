import type { EventRecord, SessionDetail } from "./types"

export interface ReadonlyAssistantHeader {
  title: string
  subtitle: string
  badges: string[]
  threadId: string
  clientName: string
  clientPid: number
  model?: string
  status?: string
  approvalPolicy?: string
  sandbox?: string
  cwd?: string
  firstSeen: string
  lastSeen: string
}

export interface ReadonlyAssistantStep {
  step: string
  status: string
}

interface ReadonlyAssistantPartBase {
  eventIds: string[]
}

export interface ReadonlyAssistantTextPart extends ReadonlyAssistantPartBase {
  type: "text"
  text: string
  phase?: string
  memoryCitation?: unknown
}

export interface ReadonlyAssistantReasoningPart extends ReadonlyAssistantPartBase {
  type: "reasoning"
  text: string
  variant: "reasoning" | "raw_content"
}

export interface ReadonlyAssistantLifecyclePart extends ReadonlyAssistantPartBase {
  type: "lifecycle"
  eventType: string
  title: string
  data: Record<string, unknown>
}

export interface ReadonlyAssistantPlanPart extends ReadonlyAssistantPartBase {
  type: "plan"
  title: string
  explanation?: string
  steps: ReadonlyAssistantStep[]
  delta?: string
}

export interface ReadonlyAssistantApprovalPart extends ReadonlyAssistantPartBase {
  type: "approval"
  title: string
  requestKind: string
  reason?: string
  command?: string[]
  cwd?: string
  data?: Record<string, unknown>
}

export interface ReadonlyAssistantToolPart extends ReadonlyAssistantPartBase {
  type: "tool"
  toolKind:
    | "exec_command"
    | "mcp_tool_call"
    | "web_search"
    | "image_generation"
    | "patch_apply"
    | "dynamic_tool_call"
    | "collab_agent"
    | "view_image"
  title: string
  status: "running" | "complete" | "error"
  command?: string[]
  cwd?: string
  output?: string
  exitCode?: number
  server?: string
  toolName?: string
  args?: unknown
  result?: unknown
  duration?: string
  query?: string
  actionType?: string
  changes?: string[]
  stdout?: string
  stderr?: string
  error?: string
  imageStatus?: string
  revisedPrompt?: string
  savedPath?: string
  interactions?: Array<{
    processId?: string
    stdin?: string
    interactionInput?: string
  }>
}

export interface ReadonlyAssistantMcpMethodPart extends ReadonlyAssistantPartBase {
  type: "mcp_method"
  method: string
  title: string
  params: Record<string, unknown>
}

export interface ReadonlyAssistantUnknownPart extends ReadonlyAssistantPartBase {
  type: "unknown"
  eventType: string
  title: string
  payload: unknown
}

export type ReadonlyAssistantPart =
  | ReadonlyAssistantTextPart
  | ReadonlyAssistantReasoningPart
  | ReadonlyAssistantLifecyclePart
  | ReadonlyAssistantPlanPart
  | ReadonlyAssistantApprovalPart
  | ReadonlyAssistantToolPart
  | ReadonlyAssistantMcpMethodPart
  | ReadonlyAssistantUnknownPart

export interface ReadonlyAssistantMessage {
  id: string
  role: "user" | "assistant"
  createdAt: string
  parts: ReadonlyAssistantPart[]
}

export interface ReadonlyAssistantThread {
  header: ReadonlyAssistantHeader
  messages: ReadonlyAssistantMessage[]
}

interface AssistantPartItem {
  kind: "assistant"
  timestamp: string
  order: number
  part: ReadonlyAssistantPart
  closeMessageAfter?: boolean
}

interface UserMessageItem {
  kind: "user"
  timestamp: string
  order: number
  message: ReadonlyAssistantMessage
}

type ProjectionItem = AssistantPartItem | UserMessageItem

interface ExecBucket {
  begin?: EventRecord
  outputs: EventRecord[]
  interactions: EventRecord[]
  end?: EventRecord
}

interface PairBucket {
  begin?: EventRecord
  end?: EventRecord
}

interface StreamBucket {
  timestamp: string
  order: number
  eventIds: string[]
  chunks: string[]
  variant: "text" | "reasoning" | "raw_content"
  terminated: boolean
}

const APPROVAL_EVENT_TYPES = new Set<string>([
  "exec_approval_request",
  "apply_patch_approval_request",
  "elicitation_request",
  "request_permissions",
  "request_user_input",
])

const LIFECYCLE_TITLES: Record<string, string> = {
  session_configured: "Session configured",
  task_started: "Turn started",
  turn_started: "Turn started",
  task_complete: "Turn complete",
  turn_complete: "Turn complete",
  turn_aborted: "Turn aborted",
  thread_name_updated: "Thread name updated",
  background_event: "Background event",
  error: "Error",
  warning: "Warning",
  stream_error: "Stream error",
  stream_info: "Stream info",
  token_count: "Token count",
  turn_diff: "Turn diff",
  model_reroute: "Model reroute",
  context_compacted: "Context compacted",
  thread_rolled_back: "Thread rolled back",
  deprecation_notice: "Deprecation notice",
  undo_started: "Undo started",
  undo_completed: "Undo completed",
  guardian_assessment: "Guardian assessment",
  mcp_startup_update: "MCP startup update",
  mcp_startup_complete: "MCP startup complete",
  get_history_entry_response: "History entry response",
  mcp_list_tools_response: "MCP tools response",
  list_skills_response: "Skills response",
  realtime_conversation_started: "Realtime conversation started",
  realtime_conversation_realtime: "Realtime conversation event",
  realtime_conversation_closed: "Realtime conversation closed",
  realtime_conversation_sdp: "Realtime conversation SDP",
  realtime_conversation_list_voices_response: "Realtime voices response",
  skills_update_available: "Skills update available",
  raw_response_item: "Raw response item",
  item_started: "Item started",
  item_completed: "Item completed",
  hook_started: "Hook started",
  hook_completed: "Hook completed",
  agent_reasoning_section_break: "Reasoning section break",
  conversation_path_response: "Conversation path response",
  review_output: "Review output",
  shutdown_complete: "Shutdown complete",
  entered_review_mode: "Entered review mode",
  exited_review_mode: "Exited review mode",
}

export function projectReadonlyAssistantThread(
  sessionDetail: SessionDetail,
  events: readonly EventRecord[],
): ReadonlyAssistantThread {
  const items: ProjectionItem[] = []
  const execBuckets = new Map<string, ExecBucket>()
  const mcpToolBuckets = new Map<string, PairBucket>()
  const webSearchBuckets = new Map<string, PairBucket>()
  const imageGenerationBuckets = new Map<string, PairBucket>()
  const patchBuckets = new Map<string, PairBucket>()
  const dynamicToolBuckets = new Map<string, PairBucket>()
  const collabSpawnBuckets = new Map<string, PairBucket>()
  const collabInteractionBuckets = new Map<string, PairBucket>()
  const collabWaitBuckets = new Map<string, PairBucket>()
  const collabCloseBuckets = new Map<string, PairBucket>()
  const collabResumeBuckets = new Map<string, PairBucket>()
  const messageStreams = new Map<string, StreamBucket>()
  const reasoningStreams = new Map<string, StreamBucket>()

  events.forEach((event, index) => {
    const eventType = event.event_type
    if (event.category === "raw_frame" || event.category === "response")
      return

    switch (eventType) {
      case "user_message":
        items.push(projectUserMessage(event, index))
        return
      case "agent_message": {
        terminateStream(messageStreams, event)
        const assistantMessage = msgOf(event)
        items.push(projectAssistantPart(event, index, {
          type: "text",
          text: str(assistantMessage, "message") ?? "",
          phase: str(assistantMessage, "phase"),
          memoryCitation: assistantMessage.memory_citation,
          eventIds: [event.event_id],
        }, { closeMessageAfter: true }))
        return
      }
      case "agent_reasoning":
        terminateStream(reasoningStreams, event)
        items.push(projectAssistantPart(event, index, {
          type: "reasoning",
          text: str(msgOf(event), "text") ?? "",
          variant: "reasoning",
          eventIds: [event.event_id],
        }))
        return
      case "agent_reasoning_raw_content":
        terminateStream(reasoningStreams, event)
        items.push(projectAssistantPart(event, index, {
          type: "reasoning",
          text: str(msgOf(event), "text") ?? "",
          variant: "raw_content",
          eventIds: [event.event_id],
        }))
        return
      case "agent_message_delta":
      case "agent_message_content_delta":
        appendStreamChunk(messageStreams, event, index, "text")
        return
      case "agent_reasoning_delta":
      case "reasoning_content_delta":
        appendStreamChunk(reasoningStreams, event, index, "reasoning")
        return
      case "agent_reasoning_raw_content_delta":
      case "reasoning_raw_content_delta":
        appendStreamChunk(reasoningStreams, event, index, "raw_content")
        return
      case "agent_reasoning_section_break":
        items.push(projectAssistantPart(event, index, {
          type: "lifecycle",
          eventType,
          title: LIFECYCLE_TITLES[eventType],
          data: stripTypeField(msgOf(event)),
          eventIds: [event.event_id],
        }))
        return
      case "exec_command_begin":
        getBucket(execBuckets, bucketId(event), () => ({ outputs: [], interactions: [] })).begin = event
        return
      case "exec_command_output_delta":
        getBucket(execBuckets, bucketId(event), () => ({ outputs: [], interactions: [] })).outputs.push(event)
        return
      case "terminal_interaction":
        getBucket(execBuckets, bucketId(event), () => ({ outputs: [], interactions: [] })).interactions.push(event)
        return
      case "exec_command_end":
        getBucket(execBuckets, bucketId(event), () => ({ outputs: [], interactions: [] })).end = event
        return
      case "mcp_tool_call_begin":
        getBucket(mcpToolBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "mcp_tool_call_end":
        getBucket(mcpToolBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "web_search_begin":
        getBucket(webSearchBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "web_search_end":
        getBucket(webSearchBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "image_generation_begin":
        getBucket(imageGenerationBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "image_generation_end":
        getBucket(imageGenerationBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "patch_apply_begin":
        getBucket(patchBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "patch_apply_end":
        getBucket(patchBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "dynamic_tool_call_request":
        getBucket(dynamicToolBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "dynamic_tool_call_response":
        getBucket(dynamicToolBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "view_image_tool_call":
        items.push(projectAssistantPart(event, index, {
          type: "tool",
          toolKind: "view_image",
          title: "View image",
          status: "complete",
          args: stripTypeField(msgOf(event)),
          eventIds: [event.event_id],
        }))
        return
      case "plan_update":
        items.push(projectAssistantPart(event, index, {
          type: "plan",
          title: "Plan update",
          explanation: str(msgOf(event), "explanation"),
          steps: list(msgOf(event), "plan").map((step) => {
            const record = asRecord(step)
            return {
              step: str(record, "step") ?? str(record, "summary") ?? "",
              status: str(record, "status") ?? "pending",
            }
          }),
          eventIds: [event.event_id],
        }))
        return
      case "plan_delta":
        items.push(projectAssistantPart(event, index, {
          type: "plan",
          title: "Plan delta",
          steps: [],
          delta: str(msgOf(event), "delta"),
          eventIds: [event.event_id],
        }))
        return
      case "collab_agent_spawn_begin":
        getBucket(collabSpawnBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "collab_agent_spawn_end":
        getBucket(collabSpawnBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "collab_agent_interaction_begin":
        getBucket(collabInteractionBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "collab_agent_interaction_end":
        getBucket(collabInteractionBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "collab_waiting_begin":
        getBucket(collabWaitBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "collab_waiting_end":
        getBucket(collabWaitBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "collab_close_begin":
        getBucket(collabCloseBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "collab_close_end":
        getBucket(collabCloseBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      case "collab_resume_begin":
        getBucket(collabResumeBuckets, bucketId(event), (): PairBucket => ({})).begin = event
        return
      case "collab_resume_end":
        getBucket(collabResumeBuckets, bucketId(event), (): PairBucket => ({})).end = event
        return
      default:
        break
    }

    if (eventType && APPROVAL_EVENT_TYPES.has(eventType)) {
      const message = msgOf(event)
      items.push(projectAssistantPart(event, index, {
        type: "approval",
        title: "Approval required",
        requestKind: eventType,
        reason: str(message, "reason"),
        command: list(message, "command").filter((value): value is string => typeof value === "string"),
        cwd: str(message, "cwd"),
        eventIds: [event.event_id],
      }))
      return
    }

    if (eventType && LIFECYCLE_TITLES[eventType]) {
      items.push(projectAssistantPart(event, index, {
        type: "lifecycle",
        eventType,
        title: LIFECYCLE_TITLES[eventType],
        data: stripTypeField(msgOf(event)),
        eventIds: [event.event_id],
      }))
      return
    }

    const methodPart = projectMcpMethod(event, index)
    if (methodPart) {
      items.push(methodPart)
      return
    }

    if (eventType) {
      items.push(projectAssistantPart(event, index, {
        type: "unknown",
        eventType,
        title: eventType,
        payload: event.payload,
        eventIds: [event.event_id],
      }))
    }
  })

  for (const [id, bucket] of execBuckets) {
    const part = projectExecBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of mcpToolBuckets) {
    const part = projectMcpToolBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of webSearchBuckets) {
    const part = projectWebSearchBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of imageGenerationBuckets) {
    const part = projectImageGenerationBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of patchBuckets) {
    const part = projectPatchBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of dynamicToolBuckets) {
    const part = projectDynamicToolBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [, bucket] of collabSpawnBuckets) {
    const part = projectCollabBucket(bucket, "Spawn agent")
    if (part)
      items.push(part)
  }
  for (const [, bucket] of collabInteractionBuckets) {
    const part = projectCollabBucket(bucket, "Send input to agent")
    if (part)
      items.push(part)
  }
  for (const [, bucket] of collabWaitBuckets) {
    const part = projectCollabBucket(bucket, "Wait for agents")
    if (part)
      items.push(part)
  }
  for (const [, bucket] of collabCloseBuckets) {
    const part = projectCollabBucket(bucket, "Close agent")
    if (part)
      items.push(part)
  }
  for (const [, bucket] of collabResumeBuckets) {
    const part = projectCollabBucket(bucket, "Resume agent")
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of messageStreams) {
    const part = projectStreamBucket(id, bucket)
    if (part)
      items.push(part)
  }
  for (const [id, bucket] of reasoningStreams) {
    const part = projectStreamBucket(id, bucket)
    if (part)
      items.push(part)
  }

  items.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.order - right.order)

  return {
    header: projectHeader(sessionDetail, events),
    messages: foldItemsIntoMessages(items),
  }
}

function projectHeader(
  sessionDetail: SessionDetail,
  events: readonly EventRecord[],
): ReadonlyAssistantHeader {
  const { session, client_source } = sessionDetail
  const title = (latestThreadTitle(events) ?? session.title?.trim()) || `thread ${session.thread_id}`
  const badges = [session.model, session.status].filter((value): value is string => !!value)
  return {
    title,
    subtitle: `${client_source.client_name} | pid ${client_source.pid} | ${session.thread_id}`,
    badges,
    threadId: session.thread_id,
    clientName: client_source.client_name,
    clientPid: client_source.pid,
    model: session.model,
    status: session.status,
    approvalPolicy: session.approval_policy,
    sandbox: session.sandbox,
    cwd: session.cwd,
    firstSeen: session.first_seen,
    lastSeen: session.last_seen,
  }
}

function projectUserMessage(event: EventRecord, order: number): UserMessageItem {
  const payload = msgOf(event)
  const message = str(payload, "message") ?? ""
  const parts: ReadonlyAssistantPart[] = []
  if (message.trim().length > 0) {
    parts.push({
      type: "text",
      text: message,
      eventIds: [event.event_id],
    })
  }

  const images = list(payload, "images").filter((value): value is string => typeof value === "string")
  const localImages = list(payload, "local_images").filter((value): value is string => typeof value === "string")
  const textElements = list(payload, "text_elements")

  if (images.length > 0 || localImages.length > 0 || textElements.length > 0) {
    parts.push({
      type: "unknown",
      eventType: "user_inputs",
      title: "User inputs",
      payload: {
        ...(images.length > 0 ? { images } : {}),
        ...(localImages.length > 0 ? { local_images: localImages } : {}),
        ...(textElements.length > 0 ? { text_elements: textElements } : {}),
      },
      eventIds: [event.event_id],
    })
  }

  if (parts.length === 0) {
    parts.push({
      type: "text",
      text: message,
      eventIds: [event.event_id],
    })
  }

  return {
    kind: "user",
    timestamp: event.timestamp,
    order,
    message: {
      id: `user-${event.event_id}`,
      role: "user",
      createdAt: event.timestamp,
      parts,
    },
  }
}

function projectAssistantPart(
  event: EventRecord,
  order: number,
  part: ReadonlyAssistantPart,
  options?: { closeMessageAfter?: boolean },
): AssistantPartItem {
  return {
    kind: "assistant",
    timestamp: event.timestamp,
    order,
    part,
    closeMessageAfter: options?.closeMessageAfter ?? false,
  }
}

function projectMcpMethod(event: EventRecord, order: number): AssistantPartItem | null {
  const method = event.event_type
  if (!method || event.category === "codex_event")
    return null
  const params = asRecord(asRecord(event.payload).params)
  const name = str(params, "name")
  const title = method === "tools/call" && name ? `${method}: ${name}` : method
  return projectAssistantPart(event, order, {
    type: "mcp_method",
    method,
    title,
    params,
    eventIds: [event.event_id],
  })
}

function foldItemsIntoMessages(items: readonly ProjectionItem[]): ReadonlyAssistantMessage[] {
  const messages: ReadonlyAssistantMessage[] = []
  let assistantMessage: ReadonlyAssistantMessage | null = null

  const flushAssistant = () => {
    if (!assistantMessage)
      return
    messages.push(assistantMessage)
    assistantMessage = null
  }

  for (const item of items) {
    if (item.kind === "user") {
      flushAssistant()
      messages.push(item.message)
      continue
    }

    if (!assistantMessage) {
      assistantMessage = {
        id: `assistant-${item.part.eventIds[0]}`,
        role: "assistant",
        createdAt: item.timestamp,
        parts: [],
      }
    }

    assistantMessage.parts.push(item.part)
    if (item.closeMessageAfter)
      flushAssistant()
  }

  flushAssistant()
  return messages
}

function projectExecBucket(id: string, bucket: ExecBucket): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.outputs[0] ?? bucket.interactions[0] ?? bucket.end
  if (!anchor)
    return null
  const beginMessage = bucket.begin ? msgOf(bucket.begin) : {}
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const command = list(beginMessage, "command").filter((value): value is string => typeof value === "string")
  const fallbackCommand = list(beginMessage, "cmd").filter((value): value is string => typeof value === "string")
  const resolvedCommand = command.length > 0 ? command : fallbackCommand
  const streamedOutput = bucket.outputs
    .map(outputEvent => base64DecodeUtf8(str(msgOf(outputEvent), "chunk") ?? ""))
    .join("")
  const output = streamedOutput
    || str(endMessage, "aggregated_output")
    || [str(endMessage, "stdout"), str(endMessage, "stderr")].filter(Boolean).join("\n")
  const exitCode = num(endMessage, "exit_code")
  const interactions = bucket.interactions.map((interactionEvent) => {
    const message = msgOf(interactionEvent)
    return {
      processId: str(message, "process_id"),
      stdin: str(message, "stdin"),
      interactionInput: str(message, "interaction_input"),
    }
  })
  const status = bucket.end
    ? mapExecCompletionStatus(str(endMessage, "status"), exitCode)
    : "running"

  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "exec_command",
      title: resolvedCommand.join(" ") || `Command ${id}`,
      status,
      command: resolvedCommand,
      cwd: str(beginMessage, "cwd"),
      output: output || undefined,
      stdout: str(endMessage, "stdout"),
      stderr: str(endMessage, "stderr"),
      interactions: interactions.length > 0 ? interactions : undefined,
      exitCode,
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...bucket.outputs.map(event => event.event_id),
        ...bucket.interactions.map(event => event.event_id),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectMcpToolBucket(id: string, bucket: PairBucket): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMessage = bucket.begin ? msgOf(bucket.begin) : {}
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const invocation = asRecord(beginMessage.invocation) || asRecord(endMessage.invocation)
  const server = str(invocation, "server")
  const toolName = str(invocation, "tool")
  const result = endMessage.result
  const status = bucket.end
    ? isErrorResult(result) ? "error" : "complete"
    : "running"

  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "mcp_tool_call",
      title: [server, toolName].filter(Boolean).join(".") || `MCP tool ${id}`,
      status,
      server: server ?? undefined,
      toolName: toolName ?? undefined,
      args: invocation.arguments,
      result,
      duration: str(endMessage, "duration"),
      error: typeof asRecord(result).Err === "string" ? asRecord(result).Err as string : undefined,
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectWebSearchBucket(_id: string, bucket: PairBucket): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const action = asRecord(endMessage.action)
  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "web_search",
      title: "Web search",
      status: bucket.end ? "complete" : "running",
      query: str(endMessage, "query"),
      actionType: str(action, "type"),
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectImageGenerationBucket(_id: string, bucket: PairBucket): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const imageStatus = str(endMessage, "status")
  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "image_generation",
      title: "Image generation",
      status: bucket.end ? mapImageCompletionStatus(imageStatus) : "running",
      result: endMessage.result,
      imageStatus,
      revisedPrompt: str(endMessage, "revised_prompt"),
      savedPath: str(endMessage, "saved_path"),
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectPatchBucket(_id: string, bucket: PairBucket): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMessage = bucket.begin ? msgOf(bucket.begin) : {}
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const changes = asRecord(beginMessage.changes)
  const success = bucket.end ? endMessage.success === true : false

  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "patch_apply",
      title: "Patch apply",
      status: bucket.end ? success ? "complete" : "error" : "running",
      changes: Object.keys(changes),
      stdout: str(endMessage, "stdout"),
      stderr: str(endMessage, "stderr"),
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectDynamicToolBucket(_id: string, bucket: PairBucket): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMessage = bucket.begin ? msgOf(bucket.begin) : {}
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const toolName = str(endMessage, "tool") ?? str(beginMessage, "tool")
  const success = bucket.end ? endMessage.success === true : undefined
  const contentItems = list(endMessage, "content_items")

  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "dynamic_tool_call",
      title: toolName ? `Dynamic tool: ${toolName}` : "Dynamic tool",
      status: bucket.end ? success === false ? "error" : "complete" : "running",
      toolName: toolName ?? undefined,
      args: beginMessage.arguments ?? endMessage.arguments,
      result: contentItems.length > 0 ? contentItems : endMessage.result,
      duration: str(endMessage, "duration"),
      error: str(endMessage, "error"),
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectCollabBucket(
  bucket: PairBucket,
  title: string,
): AssistantPartItem | null {
  const anchor = bucket.begin ?? bucket.end
  if (!anchor)
    return null
  const beginMessage = bucket.begin ? msgOf(bucket.begin) : {}
  const endMessage = bucket.end ? msgOf(bucket.end) : {}
  const status = bucket.end
    ? collabStatus(beginMessage, endMessage)
    : "running"

  return {
    kind: "assistant",
    timestamp: anchor.timestamp,
    order: Number.MAX_SAFE_INTEGER,
    part: {
      type: "tool",
      toolKind: "collab_agent",
      title,
      status,
      toolName: title,
      args: Object.keys(beginMessage).length > 0 ? stripTypeField(beginMessage) : undefined,
      result: Object.keys(endMessage).length > 0 ? stripTypeField(endMessage) : undefined,
      eventIds: [
        ...(bucket.begin ? [bucket.begin.event_id] : []),
        ...(bucket.end ? [bucket.end.event_id] : []),
      ],
    },
  }
}

function projectStreamBucket(_id: string, bucket: StreamBucket): AssistantPartItem | null {
  if (bucket.terminated)
    return null
  const text = bucket.chunks.join("")
  if (!text)
    return null
  return {
    kind: "assistant",
    timestamp: bucket.timestamp,
    order: bucket.order,
    part: bucket.variant === "text"
      ? {
          type: "text",
          text,
          eventIds: bucket.eventIds,
        }
      : {
          type: "reasoning",
          text,
          variant: bucket.variant,
          eventIds: bucket.eventIds,
        },
  }
}

function appendStreamChunk(
  store: Map<string, StreamBucket>,
  event: EventRecord,
  order: number,
  variant: StreamBucket["variant"],
) {
  const key = streamBucketId(event)
  const message = msgOf(event)
  const chunk = str(message, "delta") ?? str(message, "text") ?? ""
  let bucket = store.get(key)
  if (!bucket) {
    bucket = {
      timestamp: event.timestamp,
      order,
      eventIds: [],
      chunks: [],
      variant,
      terminated: false,
    }
    store.set(key, bucket)
  }
  bucket.eventIds.push(event.event_id)
  if (chunk)
    bucket.chunks.push(chunk)
}

function terminateStream(
  store: Map<string, StreamBucket>,
  event: EventRecord,
) {
  const bucket = store.get(streamBucketId(event))
  if (bucket)
    bucket.terminated = true
}

function bucketId(event: EventRecord): string {
  const message = msgOf(event)
  return str(message, "call_id") ?? event.command_call_id ?? event.tool_call_id ?? event.event_id
}

function streamBucketId(event: EventRecord): string {
  return event.turn_id ?? event.request_id ?? event.event_id
}

function getBucket<T>(
  store: Map<string, T>,
  id: string,
  create: () => T,
): T {
  let bucket = store.get(id)
  if (!bucket) {
    bucket = create()
    store.set(id, bucket)
  }
  return bucket
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function msgOf(event: EventRecord): Record<string, unknown> {
  const payload = asRecord(event.payload)
  const params = asRecord(payload.params)
  if (params.msg && typeof params.msg === "object")
    return params.msg as Record<string, unknown>
  if (Object.keys(params).length > 0)
    return params
  return payload
}

function str(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function num(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === "number" ? value : undefined
}

function list(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key]
  return Array.isArray(value) ? value : []
}

function stripTypeField(record: Record<string, unknown>): Record<string, unknown> {
  const { type: _type, ...rest } = record
  return rest
}

function latestThreadTitle(events: readonly EventRecord[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.event_type !== "thread_name_updated")
      continue
    const message = msgOf(event)
    const title = str(message, "thread_name") ?? str(message, "title")
    if (title?.trim())
      return title.trim()
  }
  return null
}

function isErrorResult(result: unknown): boolean {
  if (!result || typeof result !== "object")
    return false
  const record = result as Record<string, unknown>
  if ("Err" in record)
    return true
  const ok = asRecord(record.Ok)
  return ok.is_error === true
}

function mapExecCompletionStatus(
  status: string | undefined,
  exitCode: number | undefined,
): "complete" | "error" {
  if (status) {
    const normalized = status.toLowerCase()
    if (normalized === "completed")
      return "complete"
    if (normalized === "failed" || normalized === "declined")
      return "error"
  }
  return exitCode === 0 || exitCode === undefined ? "complete" : "error"
}

function mapImageCompletionStatus(status: string | undefined): "complete" | "error" {
  if (!status)
    return "complete"
  const normalized = status.toLowerCase()
  return normalized.includes("fail") || normalized.includes("error")
    ? "error"
    : "complete"
}

function collabStatus(
  beginMessage: Record<string, unknown>,
  endMessage: Record<string, unknown>,
): "complete" | "error" {
  if (isAgentStatusFailure(endMessage.status))
    return "error"

  const statuses = asRecord(endMessage.statuses)
  if (Object.values(statuses).some(isAgentStatusFailure))
    return "error"

  const hasReceiver = [
    str(endMessage, "new_thread_id"),
    str(endMessage, "receiver_thread_id"),
    ...list(endMessage, "receiver_thread_ids").filter((value): value is string => typeof value === "string"),
  ].some(Boolean)

  if (Object.keys(endMessage).length === 0)
    return "complete"

  if ("new_thread_id" in endMessage)
    return hasReceiver ? "complete" : "error"

  if ("receiver_thread_id" in beginMessage || "receiver_thread_id" in endMessage)
    return hasReceiver ? "complete" : "error"

  return "complete"
}

function isAgentStatusFailure(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.toLowerCase()
    return normalized === "errored" || normalized === "not_found"
  }

  if (!value || typeof value !== "object")
    return false

  const record = value as Record<string, unknown>
  return "Errored" in record
    || "errored" in record
    || "NotFound" in record
    || "not_found" in record
}

function base64DecodeUtf8(raw: string): string {
  if (!raw)
    return ""
  try {
    const bin = atob(raw)
    const bytes = new Uint8Array(bin.length)
    for (let index = 0; index < bin.length; index += 1)
      bytes[index] = bin.charCodeAt(index)
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    if (utf8.includes("\0") && bytes.length % 2 === 0) {
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes)
    }
    return utf8
  }
  catch {
    return raw
  }
}
