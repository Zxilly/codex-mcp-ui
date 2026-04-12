package http

import (
	"encoding/json"
	"fmt"
	nethttp "net/http"

	"github.com/codex/codex-mcp-ui/internal/hub"
)

// streamHandler serves GET /api/v1/stream as Server-Sent Events. Reconnects
// use the standard Last-Event-ID header (or `?since=` for environments that
// strip it) to pick up from the broker's ring buffer.
func streamHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		flusher, ok := w.(nethttp.Flusher)
		if !ok {
			nethttp.Error(w, "streaming unsupported", nethttp.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(nethttp.StatusOK)

		if app.Broker == nil {
			return
		}
		last := r.Header.Get("Last-Event-ID")
		if last == "" {
			last = r.URL.Query().Get("since")
		}
		ch, replay, unsub := app.Broker.Subscribe(last)
		defer unsub()

		for _, ev := range replay {
			if err := writeSSE(w, ev); err != nil {
				return
			}
			flusher.Flush()
		}
		flusher.Flush()

		for {
			select {
			case <-r.Context().Done():
				return
			case ev, ok := <-ch:
				if !ok {
					return
				}
				if err := writeSSE(w, ev); err != nil {
					return
				}
				flusher.Flush()
			}
		}
	}
}

func writeSSE(w nethttp.ResponseWriter, ev hub.BrokerEvent) error {
	buf, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", ev.EventID, ev.EventType, string(buf))
	return err
}
