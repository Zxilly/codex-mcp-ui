package proxy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHubClientPostJSONSuccess(t *testing.T) {
	var got struct {
		body    map[string]any
		path    string
		headers http.Header
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path = r.URL.Path
		got.headers = r.Header.Clone()
		_ = json.NewDecoder(r.Body).Decode(&got.body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewHubClient(srv.URL)
	require.NoError(t, c.Heartbeat(context.Background(), "proxy-abc"))
	require.Equal(t, "/api/v1/ingest/heartbeat", got.path)
	require.Equal(t, "application/json", got.headers.Get("Content-Type"))
	require.Equal(t, "proxy-abc", got.body["proxy_instance_id"])
}

func TestHubClientRegisterSendsSnakeCaseShape(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewHubClient(srv.URL)
	req := RegisterRequest{ProxyInstanceID: "p1", PID: 42, ClientSourceKey: "claude|pid-42"}
	req.ClientSource.ClientSourceKey = "claude|pid-42"
	req.ClientSource.ClientName = "Claude Desktop"
	require.NoError(t, c.Register(context.Background(), req))
	require.Equal(t, "p1", body["proxy_instance_id"])
	require.Equal(t, "claude|pid-42", body["source_key"])
	cs := body["client_source"].(map[string]any)
	require.Equal(t, "Claude Desktop", cs["client_name"])
	require.NotContains(t, body, "clientSourceKey", "no camelCase should leak on the wire")
}

func TestHubClientIngestEventPosts(t *testing.T) {
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/ingest/events", r.URL.Path)
		n.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewHubClient(srv.URL)
	err := c.IngestEvent(context.Background(), EventEnvelope{EventID: "evt-1", Direction: DirectionLocal})
	require.NoError(t, err)
	require.Equal(t, int32(1), n.Load())
}

func TestHubClientReturnsErrorOnNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := NewHubClient(srv.URL)
	err := c.Heartbeat(context.Background(), "p")
	require.Error(t, err)
	require.Contains(t, err.Error(), "503")
}

func TestHubClientTrimsTrailingSlash(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/ingest/heartbeat", r.URL.Path, "no double slashes")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewHubClient(srv.URL+"/")
	require.NoError(t, c.Heartbeat(context.Background(), "p"))
}
