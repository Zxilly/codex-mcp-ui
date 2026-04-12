package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/codex/codex-mcp-ui/internal/store/sqlite"
)

func post(t *testing.T, srv *httptest.Server, path, body string) (*http.Response, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	buf := make([]byte, 1024)
	n, _ := resp.Body.Read(buf)
	return resp, string(buf[:n])
}

func TestRegisterHandlerRejectsMissingIDs(t *testing.T) {
	srv := httptest.NewServer(NewRouter(newTestApp(t)))
	defer srv.Close()

	resp, body := post(t, srv, "/api/v1/ingest/register", `{"pid":1}`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Contains(t, body, "proxy_instance_id and source_key are required")
}

func TestRegisterHandlerRejectsInvalidJSON(t *testing.T) {
	srv := httptest.NewServer(NewRouter(newTestApp(t)))
	defer srv.Close()

	resp, _ := post(t, srv, "/api/v1/ingest/register", `not-json`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRegisterHandlerPersistsClientSourceAndProxy(t *testing.T) {
	app := newTestApp(t)
	srv := httptest.NewServer(NewRouter(app))
	defer srv.Close()

	resp, _ := post(t, srv, "/api/v1/ingest/register", `{
		"proxy_instance_id": "p-1",
		"pid": 42,
		"source_key": "claude|pid-42",
		"client_source": {"source_key": "claude|pid-42", "client_name": "Claude", "client_version": "1.0", "protocol_version": "2025-03-26", "capabilities_json": "{}"}
	}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	sources, err := app.Store.ListClientSources(t.Context())
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.Equal(t, "Claude", sources[0].ClientName)
}

func TestHeartbeatHandlerRejectsMissingID(t *testing.T) {
	srv := httptest.NewServer(NewRouter(newTestApp(t)))
	defer srv.Close()
	resp, body := post(t, srv, "/api/v1/ingest/heartbeat", `{}`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Contains(t, body, "proxy_instance_id is required")
}

func TestHeartbeatHandlerRejectsInvalidJSON(t *testing.T) {
	srv := httptest.NewServer(NewRouter(newTestApp(t)))
	defer srv.Close()
	resp, _ := post(t, srv, "/api/v1/ingest/heartbeat", `{`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestEventsHandlerRejectsInvalidJSON(t *testing.T) {
	srv := httptest.NewServer(NewRouter(newTestApp(t)))
	defer srv.Close()
	resp, _ := post(t, srv, "/api/v1/ingest/events", `not-json`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestEventsHandlerPopulatesSessionsTable(t *testing.T) {
	app := newTestApp(t)
	srv := httptest.NewServer(NewRouter(app))
	defer srv.Close()

	// Pre-register the client source so the FK join has something to point at
	// (UpsertSession doesn't enforce FK, but listing by source needs a row).
	post(t, srv, "/api/v1/ingest/register", `{
		"proxy_instance_id": "p-1", "pid": 1, "source_key": "cs-1",
		"client_source": {"source_key":"cs-1","client_name":"t","client_version":"1","protocol_version":"v1","capabilities_json":"{}"}
	}`)

	// session_configured event carries model in payload.params.msg.model.
	body := `{
		"event_id":"e-1","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-1","request_id":"1","direction":"codex_to_upstream",
		"category":"codex_event","event_type":"session_configured",
		"timestamp":"2026-04-12T00:00:00Z",
		"payload":{"method":"codex/event","params":{"_meta":{"threadId":"thr-1"},"msg":{"type":"session_configured","model":"gpt-5.2","cwd":"/tmp","approval_policy":"never"}}}
	}`
	resp, _ := post(t, srv, "/api/v1/ingest/events", body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	sess, err := app.Store.GetSession(t.Context(), "thr-1")
	require.NoError(t, err)
	require.Equal(t, "cs-1", sess.ClientSourceKey)
	require.Equal(t, "gpt-5.2", sess.Model)
	require.Equal(t, "/tmp", sess.CWD)
	require.Equal(t, "never", sess.ApprovalPolicy)

	// A second event on the same thread without msg metadata must not clobber
	// previously-captured fields (COALESCE preserves them).
	body2 := `{
		"event_id":"e-2","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-1","direction":"codex_to_upstream",
		"category":"codex_event","event_type":"task_started",
		"timestamp":"2026-04-12T00:00:01Z",
		"payload":{"method":"codex/event","params":{"_meta":{"threadId":"thr-1"},"msg":{"type":"task_started"}}}
	}`
	post(t, srv, "/api/v1/ingest/events", body2)
	sess, err = app.Store.GetSession(t.Context(), "thr-1")
	require.NoError(t, err)
	require.Equal(t, "gpt-5.2", sess.Model, "COALESCE should preserve model across subsequent events")
}

func TestEventsHandlerExtractsSessionTitle(t *testing.T) {
	app := newTestApp(t)
	srv := httptest.NewServer(NewRouter(app))
	defer srv.Close()
	post(t, srv, "/api/v1/ingest/register", `{
		"proxy_instance_id": "p-1", "pid": 1, "source_key": "cs-1",
		"client_source": {"source_key":"cs-1","client_name":"t","client_version":"1","protocol_version":"v1","capabilities_json":"{}"}
	}`)

	// thr-1: session_configured carries thread_name, later thread_name_updated overrides it.
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-1","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-1","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"session_configured","timestamp":"2026-04-12T00:00:00Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"session_configured","thread_name":"Initial"}}}
	}`)
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-2","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-1","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"thread_name_updated","timestamp":"2026-04-12T00:00:05Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"thread_name_updated","thread_name":"Renamed"}}}
	}`)
	sess, err := app.Store.GetSession(t.Context(), "thr-1")
	require.NoError(t, err)
	require.Equal(t, "Renamed", sess.Title, "thread_name_updated must win over session_configured")

	// thr-2: session starts without thread_name; user_message fills title; later session_configured MUST NOT clobber it.
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-3","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-2","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"session_configured","timestamp":"2026-04-12T00:00:00Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"session_configured"}}}
	}`)
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-4","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-2","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"user_message","timestamp":"2026-04-12T00:00:01Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"user_message","message":"  fix\nthe bug   "}}}
	}`)
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-5","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-2","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"user_message","timestamp":"2026-04-12T00:00:02Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"user_message","message":"unrelated later message"}}}
	}`)
	sess2, err := app.Store.GetSession(t.Context(), "thr-2")
	require.NoError(t, err)
	require.Equal(t, "fix the bug", sess2.Title, "first user_message wins; subsequent messages must not overwrite")

	// thr-3: thread_name_updated with empty/missing thread_name must not erase a prior title.
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-6","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-3","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"thread_name_updated","timestamp":"2026-04-12T00:00:00Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"thread_name_updated","thread_name":"Good"}}}
	}`)
	post(t, srv, "/api/v1/ingest/events", `{
		"event_id":"e-7","proxy_instance_id":"p-1","source_key":"cs-1",
		"thread_id":"thr-3","direction":"codex_to_upstream","category":"codex_event",
		"event_type":"thread_name_updated","timestamp":"2026-04-12T00:00:01Z",
		"payload":{"method":"codex/event","params":{"msg":{"type":"thread_name_updated"}}}
	}`)
	sess3, err := app.Store.GetSession(t.Context(), "thr-3")
	require.NoError(t, err)
	require.Equal(t, "Good", sess3.Title, "empty thread_name_updated must not clear prior title")
}

func TestEventsHandlerPopulatesMCPCallsTable(t *testing.T) {
	app := newTestApp(t)
	srv := httptest.NewServer(NewRouter(app))
	defer srv.Close()
	post(t, srv, "/api/v1/ingest/register", `{
		"proxy_instance_id": "p-1", "pid": 1, "source_key": "cs-1",
		"client_source": {"source_key":"cs-1","client_name":"t","client_version":"1","protocol_version":"v1","capabilities_json":"{}"}
	}`)

	// tools/call request on the upstream side.
	req := `{
		"event_id":"e-1","proxy_instance_id":"p-1","source_key":"cs-1",
		"request_id":"42","direction":"upstream_to_codex",
		"category":"jsonrpc_request","event_type":"tools/call",
		"timestamp":"2026-04-12T00:00:00Z",
		"payload":{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"codex","arguments":{"prompt":"hi"}}}
	}`
	post(t, srv, "/api/v1/ingest/events", req)

	calls, err := app.Store.ListMCPCallsBySource(t.Context(), "cs-1")
	require.NoError(t, err)
	require.Len(t, calls, 1)
	require.Equal(t, "42", calls[0].RequestID)
	require.Equal(t, "codex", calls[0].ToolName)
	require.Zero(t, calls[0].CompletedAt)
	require.Empty(t, calls[0].CompletionStatus)

	// Matching response completes the call.
	resp := `{
		"event_id":"e-2","proxy_instance_id":"p-1","source_key":"cs-1",
		"request_id":"42","direction":"codex_to_upstream",
		"category":"response","event_type":"response",
		"timestamp":"2026-04-12T00:00:02Z",
		"payload":{"jsonrpc":"2.0","id":42,"result":{"ok":true}}
	}`
	post(t, srv, "/api/v1/ingest/events", resp)
	calls, err = app.Store.ListMCPCallsBySource(t.Context(), "cs-1")
	require.NoError(t, err)
	require.Len(t, calls, 1)
	require.NotZero(t, calls[0].CompletedAt)
	require.Equal(t, "ok", calls[0].CompletionStatus)

	// Error response on a different request_id marks status=error.
	errReq := `{
		"event_id":"e-3","proxy_instance_id":"p-1","source_key":"cs-1",
		"request_id":"43","direction":"upstream_to_codex",
		"category":"jsonrpc_request","event_type":"tools/call",
		"timestamp":"2026-04-12T00:00:10Z",
		"payload":{"jsonrpc":"2.0","id":43,"method":"tools/call","params":{"name":"codex-reply"}}
	}`
	post(t, srv, "/api/v1/ingest/events", errReq)
	errResp := `{
		"event_id":"e-4","proxy_instance_id":"p-1","source_key":"cs-1",
		"request_id":"43","direction":"codex_to_upstream",
		"category":"error","event_type":"error",
		"timestamp":"2026-04-12T00:00:11Z",
		"payload":{"jsonrpc":"2.0","id":43,"error":{"code":-1,"message":"x"}}
	}`
	post(t, srv, "/api/v1/ingest/events", errResp)
	calls, err = app.Store.ListMCPCallsBySource(t.Context(), "cs-1")
	require.NoError(t, err)
	require.Len(t, calls, 2)
	var errCall sqlite.MCPCallRecord
	for _, c := range calls {
		if c.RequestID == "43" {
			errCall = c
		}
	}
	require.Equal(t, "error", errCall.CompletionStatus)
}

func TestParseTimestampMs(t *testing.T) {
	cases := map[string]bool{
		"":                              false,
		"garbage":                       false,
		"2026-04-12T12:34:56Z":          true,
		"2026-04-12T12:34:56.123Z":      true,
		"2026-04-12T12:34:56.123456Z":   true,
		"2026-04-12T12:34:56+00:00":     true,
	}
	for in, wantNonZero := range cases {
		got := parseTimestampMs(in)
		if wantNonZero {
			require.NotZerof(t, got, "in=%q", in)
		} else {
			require.Zerof(t, got, "in=%q", in)
		}
	}
}
