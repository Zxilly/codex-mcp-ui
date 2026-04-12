package http

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/codex/codex-mcp-ui/internal/hub"
	hubapi "github.com/codex/codex-mcp-ui/internal/hub/api"
)

func newTestApp(t *testing.T) *hub.App {
	t.Helper()
	app, err := hub.NewApp(hub.Config{
		UIPort:  0,
		DataDir: t.TempDir(),
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		if app.Store != nil {
			_ = app.Store.Close()
		}
	})
	return app
}

func newTestHubServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(NewRouter(newTestApp(t)))
	t.Cleanup(srv.Close)
	return srv
}

func httptestJSON(t *testing.T, srv *httptest.Server, method, path string, body io.Reader) map[string]any {
	t.Helper()
	req, err := http.NewRequest(method, srv.URL+path, body)
	require.NoError(t, err)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	out := map[string]any{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

func TestHandshakeReturnsCompatibleIdentity(t *testing.T) {
	srv := newTestHubServer(t)
	resp := httptestJSON(t, srv, http.MethodGet, "/api/v1/handshake", nil)
	require.Equal(t, "codex-mcp-ui", resp["service"])
	require.Equal(t, "v1", resp["protocolVersion"])
	require.NotEmpty(t, resp["instanceId"])
	caps, ok := resp["capabilities"].([]any)
	require.True(t, ok, "capabilities must be a JSON array")
	require.Contains(t, caps, "ingest.events")
}

func newVersionedHubServer(t *testing.T, response hubapi.HandshakeResponse) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/handshake", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestHandshakeRejectsMajorVersionMismatch(t *testing.T) {
	srv := newVersionedHubServer(t, hubapi.HandshakeResponse{
		Service:         "codex-mcp-ui",
		ProtocolVersion: "v1",
		AppVersion:      "2.0.0",
		Capabilities:    []string{"ingest.events", "admin.stop"},
		InstanceID:      "hub-123",
	})
	_, err := ValidateHandshake(srv.URL, "1.4.0")
	require.ErrorContains(t, err, "incompatible major version")
}

func TestShutdownEndpointRejectsNonLoopbackRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/shutdown", strings.NewReader(""))
	req.RemoteAddr = "10.0.0.8:9999"
	rr := httptest.NewRecorder()
	NewRouter(newTestApp(t)).ServeHTTP(rr, req)
	require.Equal(t, http.StatusForbidden, rr.Code)
}
