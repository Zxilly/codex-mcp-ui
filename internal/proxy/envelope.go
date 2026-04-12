package proxy

import (
	"encoding/json"
	"strconv"
	"time"
)

// EventEnvelope is the normalized view of any JSON-RPC frame the proxy
// observes and forwards to the hub. Wire format is snake_case with an
// ISO-8601 timestamp to match the dashboard's TypeScript types.
type EventEnvelope struct {
	EventID          string          `json:"event_id"`
	ProxyInstanceID  string          `json:"proxy_instance_id"`
	ClientSourceKey  string          `json:"source_key"`
	SessionID        string          `json:"thread_id,omitempty"`
	TurnID           string          `json:"turn_id,omitempty"`
	RequestID        string          `json:"request_id,omitempty"`
	Direction        string          `json:"direction"`
	Category         string          `json:"category"`
	EventType        string          `json:"event_type,omitempty"`
	CommandCallID    string          `json:"command_call_id,omitempty"`
	ToolCallID       string          `json:"tool_call_id,omitempty"`
	Timestamp        string          `json:"timestamp"`
	OccurredAtUnixMs int64           `json:"-"`
	Payload          json.RawMessage `json:"payload"`
}

// Direction values mirror the dashboard's EventDirection type.
const (
	DirectionUpstreamToCodex = "upstream_to_codex"
	DirectionCodexToUpstream = "codex_to_upstream"
	DirectionLocal           = "local"
)

// Category taxonomy describes the flavor of each observed frame.
const (
	CategoryJSONRPCRequest = "jsonrpc_request"
	CategoryCodexEvent     = "codex_event"
	CategoryResponse       = "response"
	CategoryError          = "error"
	CategoryRawFrame       = "raw_frame"
)

// NormalizeDirection maps the bridge's internal direction strings
// ("upstream"/"downstream") onto the wire values the dashboard expects.
func NormalizeDirection(bridgeDir string) string {
	switch bridgeDir {
	case "upstream":
		return DirectionUpstreamToCodex
	case "downstream":
		return DirectionCodexToUpstream
	default:
		return DirectionLocal
	}
}

// Normalize inspects a JSON-RPC frame in the given direction and returns an
// envelope. It is forgiving: anything that fails to parse is still emitted
// as a `raw_frame` event so operators can see malformed traffic in the UI.
func Normalize(direction string, frame []byte) EventEnvelope {
	now := time.Now()
	env := EventEnvelope{
		Direction:        NormalizeDirection(direction),
		Category:         CategoryRawFrame,
		EventType:        "raw_frame",
		Timestamp:        now.UTC().Format(time.RFC3339Nano),
		OccurredAtUnixMs: now.UnixMilli(),
		Payload:          append(json.RawMessage(nil), frame...),
	}
	var msg map[string]json.RawMessage
	if err := json.Unmarshal(frame, &msg); err != nil {
		return env
	}
	var method string
	_ = json.Unmarshal(msg["method"], &method)
	if method == "codex/event" {
		classifyCodexEvent(&env, msg["params"])
		return env
	}
	if method != "" {
		env.EventType = method
		env.Category = CategoryJSONRPCRequest
	} else if result, ok := msg["result"]; ok {
		env.EventType = "response"
		env.Category = CategoryResponse
		env.SessionID = extractThreadIDFromResult(result)
	} else if _, ok := msg["error"]; ok {
		env.EventType = "error"
		env.Category = CategoryError
	}
	if id, ok := msg["id"]; ok {
		env.RequestID = trimJSONString(id)
	}
	if params, ok := msg["params"]; ok {
		if sid := extractSessionID(params); sid != "" {
			env.SessionID = sid
		}
	}
	return env
}

func classifyCodexEvent(env *EventEnvelope, params json.RawMessage) {
	var p struct {
		Meta struct {
			ThreadID  string          `json:"threadId"`
			RequestID json.RawMessage `json:"requestId"`
		} `json:"_meta"`
		ID  string `json:"id"`
		Msg struct {
			Type      string `json:"type"`
			SessionID string `json:"session_id"`
			CallID    string `json:"call_id"`
		} `json:"msg"`
	}
	env.Category = CategoryCodexEvent
	if err := json.Unmarshal(params, &p); err != nil {
		env.EventType = "codex/event"
		return
	}
	env.EventType = p.Msg.Type
	if env.EventType == "" {
		env.EventType = "codex/event"
	}
	env.SessionID = firstNonEmpty(p.Meta.ThreadID, p.Msg.SessionID)
	if len(p.Meta.RequestID) > 0 {
		env.RequestID = trimJSONString(p.Meta.RequestID)
	}
	if p.ID != "" {
		env.TurnID = p.ID
	}
	// Surface Codex's per-command/per-tool call_id so the UI can group
	// exec_command_begin/output_delta/end (and mcp_tool_call_begin/end) rows.
	if p.Msg.CallID != "" {
		switch p.Msg.Type {
		case "exec_command_begin", "exec_command_output_delta", "exec_command_end", "exec_approval_request":
			env.CommandCallID = p.Msg.CallID
		case "mcp_tool_call_begin", "mcp_tool_call_end":
			env.ToolCallID = p.Msg.CallID
		default:
			env.CommandCallID = p.Msg.CallID
		}
	}
}

func extractSessionID(params json.RawMessage) string {
	var p struct {
		Meta struct {
			ThreadID string `json:"threadId"`
		} `json:"_meta"`
		SessionID string `json:"session_id"`
		// tools/call for codex-reply threads the conversation id through
		// arguments; surface it so the hub links the call to its session.
		Arguments struct {
			ThreadID string `json:"threadId"`
		} `json:"arguments"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return ""
	}
	return firstNonEmpty(p.Meta.ThreadID, p.SessionID, p.Arguments.ThreadID)
}

// extractThreadIDFromResult pulls threadId out of a tools/call response body.
// Codex's MCP server places it under structured_content (serialized as
// structuredContent via camelCase) — see codex-rs/mcp-server/src/codex_tool_runner.rs.
func extractThreadIDFromResult(result json.RawMessage) string {
	var r struct {
		StructuredContent struct {
			ThreadID string `json:"threadId"`
		} `json:"structuredContent"`
	}
	if err := json.Unmarshal(result, &r); err != nil {
		return ""
	}
	return r.StructuredContent.ThreadID
}

func trimJSONString(raw json.RawMessage) string {
	s := string(raw)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	if n, err := strconv.Atoi(s); err == nil {
		return strconv.Itoa(n)
	}
	return s
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
