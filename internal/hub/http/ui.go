package http

import (
	"net/http"

	"github.com/codex/codex-mcp-ui/internal/hub/web"
)

// uiHandler serves the embedded React dashboard as a static file server.
// When DistFS cannot be resolved (e.g. the embedded bundle is empty) it
// returns a small placeholder so the hub still reports a working UI route.
func uiHandler() http.Handler {
	distFS, err := web.DistFS()
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "ui bundle unavailable", http.StatusServiceUnavailable)
		})
	}
	return http.FileServer(http.FS(distFS))
}
