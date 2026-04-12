package http

import (
	"encoding/json"
	nethttp "net/http"
	"time"

	"github.com/codex/codex-mcp-ui/internal/hub"
	"github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/store/sqlite"
)

type registerRequest struct {
	ProxyInstanceID string                       `json:"proxy_instance_id"`
	PID             int                          `json:"pid"`
	ClientSourceKey string                       `json:"source_key"`
	ClientSource    api.ClientSourceRegistration `json:"client_source"`
}

type heartbeatRequest struct {
	ProxyInstanceID string `json:"proxy_instance_id"`
}

type ingestEvent struct {
	EventID         string          `json:"event_id"`
	ProxyInstanceID string          `json:"proxy_instance_id"`
	ClientSourceKey string          `json:"source_key"`
	SessionID       string          `json:"thread_id"`
	TurnID          string          `json:"turn_id"`
	RequestID       string          `json:"request_id"`
	Direction       string          `json:"direction"`
	Category        string          `json:"category"`
	EventType       string          `json:"event_type"`
	CommandCallID   string          `json:"command_call_id"`
	ToolCallID      string          `json:"tool_call_id"`
	Timestamp       string          `json:"timestamp"`
	Payload         json.RawMessage `json:"payload"`
}

func eventsHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		if app.Store == nil {
			nethttp.Error(w, "hub has no persistent store", nethttp.StatusServiceUnavailable)
			return
		}
		var body ingestEvent
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			nethttp.Error(w, "invalid json", nethttp.StatusBadRequest)
			return
		}
		occurredAt := parseTimestampMs(body.Timestamp)
		if occurredAt == 0 {
			occurredAt = time.Now().UnixMilli()
		}
		rec := sqlite.EventRecord{
			EventID:         body.EventID,
			ProxyInstanceID: body.ProxyInstanceID,
			ClientSourceKey: body.ClientSourceKey,
			SessionID:       body.SessionID,
			TurnID:          body.TurnID,
			RequestID:       body.RequestID,
			Direction:       body.Direction,
			EventType:       body.EventType,
			Category:        body.Category,
			CommandCallID:   body.CommandCallID,
			ToolCallID:      body.ToolCallID,
			OccurredAt:      occurredAt,
			RawJSON:         body.Payload,
		}
		id, err := app.Store.AppendEventReturningID(r.Context(), rec)
		if err != nil {
			nethttp.Error(w, "store error: "+err.Error(), nethttp.StatusInternalServerError)
			return
		}
		rec.EventID = id
		if app.Broker != nil {
			app.Broker.Publish(hub.BrokerEvent{
				EventID:         rec.EventID,
				ProxyInstanceID: rec.ProxyInstanceID,
				ClientSourceKey: rec.ClientSourceKey,
				SessionID:       rec.SessionID,
				TurnID:          rec.TurnID,
				RequestID:       rec.RequestID,
				Direction:       rec.Direction,
				Category:        body.Category,
				EventType:       rec.EventType,
				CommandCallID:   body.CommandCallID,
				ToolCallID:      body.ToolCallID,
				Timestamp:       unixMillisToISO(rec.OccurredAt),
				Payload:         rec.RawJSON,
			})
		}
		writeJSON(w, nethttp.StatusOK, map[string]string{"status": "ok", "event_id": rec.EventID})
	}
}

func parseTimestampMs(ts string) int64 {
	if ts == "" {
		return 0
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}

func registerHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		if app.Store == nil {
			nethttp.Error(w, "hub has no persistent store", nethttp.StatusServiceUnavailable)
			return
		}
		var body registerRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			nethttp.Error(w, "invalid json", nethttp.StatusBadRequest)
			return
		}
		if body.ProxyInstanceID == "" || body.ClientSourceKey == "" {
			nethttp.Error(w, "proxy_instance_id and source_key are required", nethttp.StatusBadRequest)
			return
		}
		cs := body.ClientSource
		if err := app.Store.UpsertClientSource(r.Context(), sqlite.ClientSourceRecord{
			ClientSourceKey:  cs.ClientSourceKey,
			PID:              cs.PID,
			ProtocolVersion:  cs.ProtocolVersion,
			ClientName:       cs.ClientName,
			ClientVersion:    cs.ClientVersion,
			CapabilitiesJSON: cs.CapabilitiesJSON,
			ExecutablePath:   cs.ExecutablePath,
			CommandLine:      cs.CommandLine,
			CWD:              cs.CWD,
		}); err != nil {
			nethttp.Error(w, "store error: "+err.Error(), nethttp.StatusInternalServerError)
			return
		}
		if err := app.Store.RegisterProxy(r.Context(), sqlite.RegisterProxyParams{
			ProxyInstanceID: body.ProxyInstanceID,
			ClientSourceKey: body.ClientSourceKey,
			PID:             body.PID,
		}); err != nil {
			nethttp.Error(w, "store error: "+err.Error(), nethttp.StatusInternalServerError)
			return
		}
		writeJSON(w, nethttp.StatusOK, map[string]string{"status": "registered"})
	}
}

func heartbeatHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		if app.Store == nil {
			nethttp.Error(w, "hub has no persistent store", nethttp.StatusServiceUnavailable)
			return
		}
		var body heartbeatRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			nethttp.Error(w, "invalid json", nethttp.StatusBadRequest)
			return
		}
		if body.ProxyInstanceID == "" {
			nethttp.Error(w, "proxy_instance_id is required", nethttp.StatusBadRequest)
			return
		}
		if err := app.Store.HeartbeatProxy(r.Context(), body.ProxyInstanceID); err != nil {
			nethttp.Error(w, "store error: "+err.Error(), nethttp.StatusInternalServerError)
			return
		}
		writeJSON(w, nethttp.StatusOK, map[string]string{"status": "ok"})
	}
}
