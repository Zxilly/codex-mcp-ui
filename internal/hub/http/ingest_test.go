package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
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
