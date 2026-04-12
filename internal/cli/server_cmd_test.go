package cli

import (
	"bytes"
	"encoding/json"
	"net"
	nethttp "net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"

	hubapi "github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/version"
)

func writeTestJSON(w nethttp.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

// startTestHubOnPort binds a compatible hub handshake server on 127.0.0.1
// at the requested port; returns the port for --ui-port flag use.
func startTestHubOnPort(t *testing.T, extra nethttp.Handler) (int, *int32) {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	var shutdownCalls int32
	mux := nethttp.NewServeMux()
	mux.HandleFunc("/api/v1/handshake", func(w nethttp.ResponseWriter, r *nethttp.Request) {
		writeTestJSON(w, hubapi.HandshakeResponse{
			Service:         version.ServiceName,
			ProtocolVersion: version.ProtocolVersion,
			AppVersion:      version.AppVersion,
			Capabilities:    append([]string(nil), hubapi.RequiredCapabilities...),
			InstanceID:      "hub-test",
			PID:             1,
		})
	})
	mux.HandleFunc("/api/v1/status", func(w nethttp.ResponseWriter, r *nethttp.Request) {
		writeTestJSON(w, hubapi.StatusResponse{
			Service:    version.ServiceName,
			AppVersion: version.AppVersion,
			PID:        1,
			InstanceID: "hub-test",
		})
	})
	mux.HandleFunc("/api/v1/admin/shutdown", func(w nethttp.ResponseWriter, r *nethttp.Request) {
		atomic.AddInt32(&shutdownCalls, 1)
		writeTestJSON(w, map[string]string{"status": "stopping"})
	})
	if extra != nil {
		mux.Handle("/", extra)
	}
	srv := &nethttp.Server{Handler: mux}
	go func() { _ = srv.Serve(l) }()
	t.Cleanup(func() { _ = srv.Close() })

	port := l.Addr().(*net.TCPAddr).Port
	return port, &shutdownCalls
}

func runRoot(t *testing.T, args ...string) (string, error) {
	t.Helper()
	cmd := NewRootCmd()
	buf := &bytes.Buffer{}
	cmd.SetOut(buf)
	cmd.SetErr(buf)
	cmd.SetArgs(args)
	err := cmd.Execute()
	return buf.String(), err
}

func TestServerStatusCommandPrintsHubStatus(t *testing.T) {
	port, _ := startTestHubOnPort(t, nil)
	out, err := runRoot(t, "server", "status", "--ui-port", strconv.Itoa(port))
	require.NoError(t, err)
	require.Contains(t, out, `"service": "codex-mcp-ui"`)
	require.Contains(t, out, `"instanceId": "hub-test"`)
}

func TestServerStopCommandInvokesShutdownEndpoint(t *testing.T) {
	port, stops := startTestHubOnPort(t, nil)
	out, err := runRoot(t, "server", "stop", "--ui-port", strconv.Itoa(port))
	require.NoError(t, err)
	require.Contains(t, out, "hub stopping")
	require.Equal(t, int32(1), atomic.LoadInt32(stops))
}

func TestServerStatusReportsUnreachableHub(t *testing.T) {
	// Use a port unlikely to be bound. Non-listening port → connection refused.
	_, err := runRoot(t, "server", "status", "--ui-port", "1")
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "not reachable") || strings.Contains(err.Error(), "incompatible"))
}

func TestHubBaseURLUsesDefaultPort(t *testing.T) {
	cmd := NewRootCmd()
	// With no explicit --ui-port, the default 8787 is used.
	base, err := hubBaseURL(cmd.Commands()[0])
	require.NoError(t, err)
	require.Equal(t, "http://127.0.0.1:8787", base)
}

func TestHubBaseURLRejectsZeroPort(t *testing.T) {
	cmd := NewRootCmd()
	require.NoError(t, cmd.PersistentFlags().Set("ui-port", "0"))
	_, err := hubBaseURL(cmd.Commands()[0])
	require.Error(t, err)
	require.Contains(t, err.Error(), "--ui-port is required")
}

func TestHubBaseURLFormatsLoopbackURL(t *testing.T) {
	cmd := NewRootCmd()
	require.NoError(t, cmd.PersistentFlags().Set("ui-port", "9999"))
	base, err := hubBaseURL(cmd.Commands()[0])
	require.NoError(t, err)
	require.Equal(t, "http://127.0.0.1:9999", base)
}

