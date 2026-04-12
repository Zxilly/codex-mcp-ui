package http

import (
	"net"
	nethttp "net/http"

	"github.com/codex/codex-mcp-ui/internal/hub"
	"github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/version"
)

// requireLoopback rejects requests that do not originate from a loopback
// address. The hub's admin surface must never be accessible off-host.
func requireLoopback(next nethttp.HandlerFunc) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			nethttp.Error(w, "forbidden: loopback only", nethttp.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	}
}

func statusHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		writeJSON(w, nethttp.StatusOK, api.StatusResponse{
			Service:    version.ServiceName,
			AppVersion: version.AppVersion,
			PID:        app.PID,
			DataDir:    app.Config.DataDir,
			InstanceID: app.InstanceID,
			UIPort:     app.Config.UIPort,
		})
	}
}

func shutdownHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		app.TriggerShutdown()
		writeJSON(w, nethttp.StatusOK, map[string]string{"status": "stopping"})
	}
}
