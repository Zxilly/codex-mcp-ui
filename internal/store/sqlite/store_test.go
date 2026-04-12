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
