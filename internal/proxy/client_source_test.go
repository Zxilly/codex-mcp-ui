package proxy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/codex/codex-mcp-ui/internal/hub/api"
)

func TestDeriveClientSourceKeyIncludesPIDAndInitializeMetadata(t *testing.T) {
	key := DeriveClientSourceKey(18244, InitializeFingerprint{
		ProtocolVersion:  "2025-03-26",
		ClientName:       "Claude Desktop",
		ClientVersion:    "1.2.3",
		CapabilitiesJSON: `{"elicitation":true}`,
	})
	require.Contains(t, key, "18244")
	require.Contains(t, key, "Claude Desktop")
}

func incompatibleHubServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/handshake", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(api.HandshakeResponse{
			Service:         "some-other-service",
			ProtocolVersion: "v0",
			AppVersion:      "9.9.9",
			Capabilities:    []string{"nope"},
			InstanceID:      "hub-x",
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestHubClientRejectsIncompatibleHandshake(t *testing.T) {
	srv := incompatibleHubServer(t)
	_, err := NewHubClient(srv.URL).Handshake(context.Background())
	require.ErrorContains(t, err, "incompatible")
}
