package http

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/codex/codex-mcp-ui/internal/store/sqlite"
)

// TestUIEndpointsReturnSnakeCaseShape seeds a live store with one client
// source, session, and event, then asserts every UI-facing endpoint
// returns the snake_case fields the dashboard's TypeScript types expect.
func TestUIEndpointsReturnSnakeCaseShape(t *testing.T) {
	app := newTestApp(t)
	ctx := context.Background()
	require.NoError(t, app.Store.UpsertClientSource(ctx, sqlite.ClientSourceRecord{
		ClientSourceKey: "claude|pid-18244",
		PID:             18244,
		ProtocolVersion: "2024-11-05",
		ClientName:      "Claude Desktop",
		ClientVersion:   "1.2.3",
		CapabilitiesJSON: "{}",
	}))
	require.NoError(t, app.Store.UpsertSession(ctx, sqlite.SessionRecord{
		SessionID:       "thread-abc",
		ClientSourceKey: "claude|pid-18244",
		Model:           "gpt-5.4",
	}))
	require.NoError(t, app.Store.AppendEvent(ctx, sqlite.EventRecord{
		SessionID: "thread-abc",
		EventType: "session_configured",
		Direction: "codex_to_upstream",
		RawJSON:   []byte(`{"hello":"world"}`),
	}))
	require.NoError(t, app.Store.RegisterProxy(ctx, sqlite.RegisterProxyParams{
		ProxyInstanceID: "proxy-1",
		ClientSourceKey: "claude|pid-18244",
		PID:             18244,
	}))

	srv := httptest.NewServer(NewRouter(app))
	defer srv.Close()

	t.Run("client-sources has snake_case items", func(t *testing.T) {
		raw := fetchRaw(t, srv, "/api/v1/client-sources")
		requireFieldsPresent(t, raw, "items")
		requireItemFields(t, raw, "source_key", "client_name", "pid", "first_seen", "last_seen", "session_count")
		requireItemFieldsAbsent(t, raw, "clientSourceKey", "clientName", "firstSeenAt")
	})

	t.Run("sessions for source has snake_case items", func(t *testing.T) {
		raw := fetchRaw(t, srv, "/api/v1/client-sources/claude%7Cpid-18244/sessions")
		requireFieldsPresent(t, raw, "items")
		requireItemFields(t, raw, "thread_id", "source_key", "first_seen", "last_seen")
	})

	t.Run("session detail has snake_case nested shape", func(t *testing.T) {
		raw := fetchRaw(t, srv, "/api/v1/sessions/thread-abc")
		requireFieldsPresent(t, raw, "session", "client_source", "recent_events")
		session := raw["session"].(map[string]any)
		require.Equal(t, "thread-abc", session["thread_id"])
		require.Equal(t, "claude|pid-18244", session["source_key"])
		cs := raw["client_source"].(map[string]any)
		require.Equal(t, "Claude Desktop", cs["client_name"])
		events := raw["recent_events"].([]any)
		require.NotEmpty(t, events)
		evt := events[0].(map[string]any)
		requireKeys(t, evt, "event_id", "timestamp", "source_key", "thread_id", "direction", "category", "event_type", "payload")
	})

	t.Run("session events has snake_case items", func(t *testing.T) {
		raw := fetchRaw(t, srv, "/api/v1/sessions/thread-abc/events")
		items := raw["items"].([]any)
		require.NotEmpty(t, items)
		evt := items[0].(map[string]any)
		requireKeys(t, evt, "event_id", "timestamp", "source_key", "direction", "category", "payload")
	})

	t.Run("proxies list has snake_case items", func(t *testing.T) {
		raw := fetchRaw(t, srv, "/api/v1/proxies")
		items := raw["items"].([]any)
		require.NotEmpty(t, items)
		p := items[0].(map[string]any)
		requireKeys(t, p, "proxy_instance_id", "pid", "started_at", "last_heartbeat_at")
	})

	t.Run("stream SSE payloads are snake_case", func(t *testing.T) {
		// Subscribe first, then ingest an event.
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/api/v1/stream", nil)
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		go func() {
			body := `{"event_id":"evt-stream-1","proxy_instance_id":"proxy-1","source_key":"claude|pid-18244","thread_id":"thread-abc","direction":"codex_to_upstream","category":"codex_event","event_type":"turn_complete","timestamp":"2026-04-12T00:00:00Z","payload":{"hi":1}}`
			time.Sleep(50 * time.Millisecond)
			postIngest(t, srv, "/api/v1/ingest/events", body)
		}()

		data := readFirstSSEData(t, resp.Body)
		var env map[string]any
		require.NoError(t, json.Unmarshal([]byte(data), &env))
		requireKeys(t, env, "event_id", "proxy_instance_id", "source_key", "thread_id", "direction", "category", "event_type", "timestamp", "payload")
		require.NotContains(t, env, "eventId")
		require.NotContains(t, env, "occurredAtUnixMs")
	})
}

func fetchRaw(t *testing.T, srv *httptest.Server, path string) map[string]any {
	t.Helper()
	resp, err := srv.Client().Get(srv.URL + path)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equalf(t, http.StatusOK, resp.StatusCode, "GET %s", path)
	out := map[string]any{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

func postIngest(t *testing.T, srv *httptest.Server, path, body string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	resp.Body.Close()
}

func readFirstSSEData(t *testing.T, body io.Reader) string {
	t.Helper()
	buf := make([]byte, 8192)
	deadline := time.Now().Add(2 * time.Second)
	var accum []byte
	for time.Now().Before(deadline) {
		n, err := body.Read(buf)
		if n > 0 {
			accum = append(accum, buf[:n]...)
			for _, line := range strings.Split(string(accum), "\n") {
				if strings.HasPrefix(line, "data: ") {
					return strings.TrimPrefix(line, "data: ")
				}
			}
		}
		if err != nil {
			break
		}
	}
	t.Fatalf("no SSE data frame within deadline")
	return ""
}

func requireFieldsPresent(t *testing.T, m map[string]any, keys ...string) {
	t.Helper()
	for _, k := range keys {
		require.Containsf(t, m, k, "missing top-level field %q", k)
	}
}

func requireKeys(t *testing.T, m map[string]any, keys ...string) {
	t.Helper()
	for _, k := range keys {
		require.Containsf(t, m, k, "missing field %q in %v", k, keysOf(m))
	}
}

func keysOf(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func requireItemFields(t *testing.T, m map[string]any, keys ...string) {
	t.Helper()
	items := m["items"].([]any)
	require.NotEmpty(t, items, "items array is empty, cannot inspect fields")
	first := items[0].(map[string]any)
	for _, k := range keys {
		require.Containsf(t, first, k, fmt.Sprintf("missing field %q", k))
	}
}

func requireItemFieldsAbsent(t *testing.T, m map[string]any, keys ...string) {
	t.Helper()
	items := m["items"].([]any)
	require.NotEmpty(t, items)
	first := items[0].(map[string]any)
	for _, k := range keys {
		require.NotContainsf(t, first, k, fmt.Sprintf("should not contain camelCase %q", k))
	}
}
