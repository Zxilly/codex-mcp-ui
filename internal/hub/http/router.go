package http

import (
	"net/http"
	"strings"

	"github.com/codex/codex-mcp-ui/internal/hub"
)

// touchMiddleware resets the app's idle watcher whenever an API request
// arrives, so active clients keep the hub alive.
func touchMiddleware(app *hub.App, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v1/") {
			app.Touch()
		}
		next.ServeHTTP(w, r)
	})
}

// NewRouter wires all hub HTTP endpoints onto the shared App state.
func NewRouter(app *hub.App) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/handshake", handshakeHandler(app))
	mux.HandleFunc("GET /api/v1/status", statusHandler(app))
	mux.HandleFunc("POST /api/v1/admin/shutdown", requireLoopback(shutdownHandler(app)))
	mux.HandleFunc("POST /api/v1/ingest/register", requireLoopback(registerHandler(app)))
	mux.HandleFunc("POST /api/v1/ingest/heartbeat", requireLoopback(heartbeatHandler(app)))
	mux.HandleFunc("POST /api/v1/ingest/events", requireLoopback(eventsHandler(app)))
	mux.HandleFunc("GET /api/v1/client-sources", clientSourcesHandler(app))
	mux.HandleFunc("GET /api/v1/client-sources/{sourceKey}/sessions", sessionsForClientSourceHandler(app))
	mux.HandleFunc("GET /api/v1/proxies", proxiesHandler(app))
	mux.HandleFunc("GET /api/v1/sessions/{threadId}", sessionDetailHandler(app))
	mux.HandleFunc("GET /api/v1/sessions/{threadId}/events", sessionEventsHandler(app))
	mux.HandleFunc("GET /api/v1/stream", streamHandler(app))
	mux.Handle("GET /", uiHandler())
	return touchMiddleware(app, mux)
}
