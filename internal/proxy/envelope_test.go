package proxy

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeDirection(t *testing.T) {
	cases := map[string]string{
		"upstream":   DirectionUpstreamToCodex,
		"downstream": DirectionCodexToUpstream,
		"":           DirectionLocal,
		"garbage":    DirectionLocal,
	}
	for in, want := range cases {
		require.Equalf(t, want, NormalizeDirection(in), "in=%q", in)
	}
}

func TestNormalizeRawFrameOnInvalidJSON(t *testing.T) {
	env := Normalize("downstream", []byte("not-json"))
	require.Equal(t, CategoryRawFrame, env.Category)
	require.Equal(t, "raw_frame", env.EventType)
	require.Equal(t, DirectionCodexToUpstream, env.Direction)
	require.NotEmpty(t, env.Timestamp)
	require.NotZero(t, env.OccurredAtUnixMs)
}

func TestNormalizeJSONRPCRequest(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"codex","arguments":{}}}`)
	env := Normalize("upstream", frame)
	require.Equal(t, CategoryJSONRPCRequest, env.Category)
	require.Equal(t, "tools/call", env.EventType)
	require.Equal(t, "7", env.RequestID)
	require.Equal(t, DirectionUpstreamToCodex, env.Direction)
}

func TestNormalizeJSONRPCStringID(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","id":"req-a1","method":"initialize","params":{}}`)
	env := Normalize("upstream", frame)
	require.Equal(t, "req-a1", env.RequestID, "string id unwrapped from quotes")
}

func TestNormalizeResponseAndError(t *testing.T) {
	resp := Normalize("downstream", []byte(`{"jsonrpc":"2.0","id":1,"result":{"ok":true}}`))
	require.Equal(t, CategoryResponse, resp.Category)
	require.Equal(t, "response", resp.EventType)

	errEnv := Normalize("downstream", []byte(`{"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"bad"}}`))
	require.Equal(t, CategoryError, errEnv.Category)
	require.Equal(t, "error", errEnv.EventType)
}

func TestNormalizeCodexEventSessionConfigured(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","method":"codex/event","params":{"_meta":{"threadId":"thr-1","requestId":"42"},"id":"turn-a","msg":{"type":"session_configured","session_id":"thr-1","model":"gpt-5.4"}}}`)
	env := Normalize("downstream", frame)
	require.Equal(t, CategoryCodexEvent, env.Category)
	require.Equal(t, "session_configured", env.EventType)
	require.Equal(t, "thr-1", env.SessionID)
	require.Equal(t, "42", env.RequestID)
	require.Equal(t, "turn-a", env.TurnID)
}

func TestNormalizeCodexEventExtractsCommandCallID(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","method":"codex/event","params":{"_meta":{"threadId":"thr","requestId":1},"id":"turn","msg":{"type":"exec_command_begin","call_id":"cmd-77","command":["ls"]}}}`)
	env := Normalize("downstream", frame)
	require.Equal(t, "cmd-77", env.CommandCallID)
	require.Empty(t, env.ToolCallID)
}

func TestNormalizeCodexEventExtractsToolCallID(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","method":"codex/event","params":{"_meta":{"threadId":"thr"},"id":"turn","msg":{"type":"mcp_tool_call_begin","call_id":"tool-9"}}}`)
	env := Normalize("downstream", frame)
	require.Equal(t, "tool-9", env.ToolCallID)
	require.Empty(t, env.CommandCallID)
}

func TestNormalizeCodexEventFallsBackOnUnknownType(t *testing.T) {
	// Unknown codex event types still get category codex_event and routes
	// call_id to CommandCallID as the default bucket.
	frame := []byte(`{"jsonrpc":"2.0","method":"codex/event","params":{"_meta":{"threadId":"thr"},"id":"turn","msg":{"type":"brand_new_event","call_id":"x-1"}}}`)
	env := Normalize("downstream", frame)
	require.Equal(t, CategoryCodexEvent, env.Category)
	require.Equal(t, "brand_new_event", env.EventType)
	require.Equal(t, "x-1", env.CommandCallID)
}

func TestNormalizeCodexEventMissingMsgType(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","method":"codex/event","params":{"_meta":{"threadId":"thr"},"id":"turn","msg":{}}}`)
	env := Normalize("downstream", frame)
	require.Equal(t, "codex/event", env.EventType, "blank msg.type falls back to method name")
}

func TestNormalizeExtractsSessionIDFromRegularParams(t *testing.T) {
	frame := []byte(`{"jsonrpc":"2.0","id":3,"method":"custom/method","params":{"_meta":{"threadId":"thr-meta"},"session_id":"thr-body"}}`)
	env := Normalize("upstream", frame)
	require.Equal(t, "thr-meta", env.SessionID, "_meta.threadId wins over body session_id")
}

func TestTrimJSONString(t *testing.T) {
	cases := map[string]string{
		`"hello"`: "hello",
		`42`:      "42",
		`null`:    "null",
		`"12"`:    "12",
	}
	for in, want := range cases {
		require.Equalf(t, want, trimJSONString(json.RawMessage(in)), "in=%s", in)
	}
}

func TestFirstNonEmpty(t *testing.T) {
	require.Equal(t, "a", firstNonEmpty("", "a", "b"))
	require.Equal(t, "", firstNonEmpty("", "", ""))
	require.Equal(t, "x", firstNonEmpty("x"))
}
