package sqlite

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	store, err := Open(path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestStoreRegistersProxyAndHeartbeat(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	id := "proxy-1"
	require.NoError(t, store.RegisterProxy(ctx, RegisterProxyParams{ProxyInstanceID: id, PID: 4242}))
	require.NoError(t, store.HeartbeatProxy(ctx, id))
	got, err := store.ListActiveProxies(ctx)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, id, got[0].ProxyInstanceID)
}

func TestStorePersistsEventAndListsSessionTimeline(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	require.NoError(t, store.RegisterProxy(ctx, RegisterProxyParams{ProxyInstanceID: "p1", PID: 1}))
	require.NoError(t, store.AppendEvent(ctx, EventRecord{
		ProxyInstanceID: "p1",
		SessionID:       "thread-1",
		EventType:       "session_configured",
		Direction:       "downstream",
		RawJSON:         []byte(`{"method":"codex/event"}`),
	}))
	events, err := store.ListSessionEvents(ctx, "thread-1", 100, "")
	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, "session_configured", events[0].EventType)
}

func TestListSessionEventsPagesInChronologicalOrder(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	require.NoError(t, store.RegisterProxy(ctx, RegisterProxyParams{ProxyInstanceID: "p1", PID: 1}))

	for _, event := range []EventRecord{
		{EventID: "evt-b", ProxyInstanceID: "p1", SessionID: "thread-1", EventType: "turn_started", Direction: "downstream", OccurredAt: 1000, RawJSON: []byte(`{"n":1}`)},
		{EventID: "evt-z", ProxyInstanceID: "p1", SessionID: "thread-1", EventType: "turn_delta", Direction: "downstream", OccurredAt: 1000, RawJSON: []byte(`{"n":2}`)},
		{EventID: "evt-a", ProxyInstanceID: "p1", SessionID: "thread-1", EventType: "turn_complete", Direction: "downstream", OccurredAt: 2000, RawJSON: []byte(`{"n":3}`)},
		{EventID: "evt-y", ProxyInstanceID: "p1", SessionID: "thread-1", EventType: "turn_complete", Direction: "downstream", OccurredAt: 3000, RawJSON: []byte(`{"n":4}`)},
	} {
		require.NoError(t, store.AppendEvent(ctx, event))
	}

	page1, err := store.ListSessionEventsPage(ctx, "thread-1", 2, "")
	require.NoError(t, err)
	require.Equal(t, []string{"evt-b", "evt-z"}, eventIDs(page1.Items))
	require.Equal(t, formatSessionEventCursor(1000, "evt-z"), page1.NextCursor)

	page2, err := store.ListSessionEventsPage(ctx, "thread-1", 2, page1.NextCursor)
	require.NoError(t, err)
	require.Equal(t, []string{"evt-a", "evt-y"}, eventIDs(page2.Items))
	require.Empty(t, page2.NextCursor)
}

func TestListSessionEventsPageAcceptsZeroTimestampCursor(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	require.NoError(t, store.RegisterProxy(ctx, RegisterProxyParams{ProxyInstanceID: "p1", PID: 1}))
	_, err := store.db.ExecContext(ctx, `INSERT INTO events (
		event_id, proxy_instance_id, client_source_key, session_id, turn_id,
		request_id, direction, event_type, occurred_at, raw_json,
		category, command_call_id, tool_call_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"evt-a", "p1", nil, "thread-1", nil,
		nil, "downstream", "turn_started", 0, []byte(`{"n":1}`),
		"", nil, nil)
	require.NoError(t, err)
	_, err = store.db.ExecContext(ctx, `INSERT INTO events (
		event_id, proxy_instance_id, client_source_key, session_id, turn_id,
		request_id, direction, event_type, occurred_at, raw_json,
		category, command_call_id, tool_call_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"evt-b", "p1", nil, "thread-1", nil,
		nil, "downstream", "turn_complete", 1, []byte(`{"n":2}`),
		"", nil, nil)
	require.NoError(t, err)

	page, err := store.ListSessionEventsPage(ctx, "thread-1", 10, "0|evt-a")
	require.NoError(t, err)
	require.Equal(t, []string{"evt-b"}, eventIDs(page.Items))
	require.Empty(t, page.NextCursor)
}

func TestStorePersistsClientSourceAndToolCallCorrelation(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	require.NoError(t, store.RegisterProxy(ctx, RegisterProxyParams{ProxyInstanceID: "p1", PID: 1}))
	require.NoError(t, store.UpsertClientSource(ctx, ClientSourceRecord{
		ClientSourceKey:  "claude|pid-18244",
		PID:              18244,
		ProtocolVersion:  "2025-03-26",
		ClientName:       "Claude Desktop",
		ClientVersion:    "1.2.3",
		CapabilitiesJSON: `{"elicitation":true}`,
	}))
	require.NoError(t, store.UpsertMCPCall(ctx, MCPCallRecord{
		RequestID:       "1",
		ProxyInstanceID: "p1",
		ClientSourceKey: "claude|pid-18244",
		SessionID:       "thread-1",
		ToolName:        "codex",
	}))
	sources, err := store.ListClientSources(ctx)
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.Equal(t, "Claude Desktop", sources[0].ClientName)
}

func eventIDs(events []EventRecord) []string {
	out := make([]string, 0, len(events))
	for _, event := range events {
		out = append(out, event.EventID)
	}
	return out
}
