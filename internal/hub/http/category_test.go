package http

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/codex/codex-mcp-ui/internal/store/sqlite"
)

func TestCategoryForEvent(t *testing.T) {
	cases := []struct {
		eventType string
		want      string
	}{
		{"", "raw_frame"},
		{"raw_frame", "raw_frame"},
		{"response", "response"},
		{"error", "error"},
		{"session_configured", "codex_event"},
		{"task_complete", "codex_event"},
		{"turn_complete", "codex_event"},
		{"task_started", "codex_event"},
		{"exec_command_begin", "codex_event"},
		{"exec_command_output_delta", "codex_event"},
		{"exec_command_end", "codex_event"},
		{"mcp_tool_call_begin", "codex_event"},
		{"apply_patch_approval_request", "codex_event"},
		{"agent_message", "codex_event"},
		{"agent_message_delta", "codex_event"},
		{"plan_update", "codex_event"},
		{"plan_delta", "codex_event"},
		{"tools/call", "jsonrpc_request"},
		{"initialize", "jsonrpc_request"},
		{"notifications/cancelled", "jsonrpc_request"},
	}
	for _, c := range cases {
		t.Run(c.eventType, func(t *testing.T) {
			got := categoryForEvent(sqlite.EventRecord{EventType: c.eventType})
			require.Equal(t, c.want, got)
		})
	}
}
