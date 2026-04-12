package http

import (
	"context"
	"encoding/json"
	nethttp "net/http"
	"strings"
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
		derivePersistentRows(r.Context(), app, body, occurredAt)
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

// Wire values shared with internal/proxy's envelope; duplicated locally to
// avoid the proxy→hub/http import cycle. See internal/proxy/envelope.go.
const (
	directionUpstreamToCodex = "upstream_to_codex"
	directionCodexToUpstream = "codex_to_upstream"
	categoryResponse         = "response"
	categoryError            = "error"
)

// parsedPayload is the union of every field the ingest extractors need.
// Unmarshaling once and handing the struct to each extractor avoids parsing
// the same payload three times on the hot path. Field names mirror
// codex-rs/protocol/src/protocol.rs (SessionConfiguredEvent,
// ThreadNameUpdatedEvent, UserMessageEvent) and MCP tools/call params.
type parsedPayload struct {
	Params struct {
		Name string `json:"name"`
		Msg  struct {
			Model          string `json:"model"`
			CWD            string `json:"cwd"`
			ApprovalPolicy string `json:"approval_policy"`
			ThreadName     string `json:"thread_name"`
			Message        string `json:"message"`
		} `json:"msg"`
	} `json:"params"`
}

func parsePayload(payload json.RawMessage) parsedPayload {
	var p parsedPayload
	_ = json.Unmarshal(payload, &p)
	return p
}

// derivePersistentRows populates the sessions and mcp_calls tables from the
// ingested event. The events table is authoritative; these are denormalized
// indexes the UI queries directly. Errors are swallowed intentionally: a
// failed upsert here must not reject the underlying event write.
func derivePersistentRows(ctx context.Context, app *hub.App, body ingestEvent, occurredAt int64) {
	if app.Store == nil {
		return
	}
	p := parsePayload(body.Payload)
	if body.SessionID != "" && body.ClientSourceKey != "" {
		model, cwd, approval := extractSessionFields(body.EventType, p)
		_ = app.Store.UpsertSession(ctx, sqlite.SessionRecord{
			SessionID:       body.SessionID,
			ClientSourceKey: body.ClientSourceKey,
			Model:           model,
			CWD:             cwd,
			ApprovalPolicy:  approval,
		})
		writeSessionTitle(ctx, app, body.SessionID, body.EventType, p)
	}
	if body.RequestID != "" && body.Direction == directionUpstreamToCodex && body.EventType == "tools/call" {
		if p.Params.Name != "" && body.ProxyInstanceID != "" && body.ClientSourceKey != "" {
			_ = app.Store.UpsertMCPCall(ctx, sqlite.MCPCallRecord{
				RequestID:       body.RequestID,
				ProxyInstanceID: body.ProxyInstanceID,
				ClientSourceKey: body.ClientSourceKey,
				SessionID:       body.SessionID,
				ToolName:        p.Params.Name,
				StartedAt:       occurredAt,
			})
		}
	}
	if body.RequestID != "" && body.Direction == directionCodexToUpstream &&
		(body.Category == categoryResponse || body.Category == categoryError) {
		status := "ok"
		if body.Category == categoryError {
			status = "error"
		}
		_ = app.Store.CompleteMCPCall(ctx, body.RequestID, occurredAt, status)
	}
}

func extractSessionFields(eventType string, p parsedPayload) (model, cwd, approval string) {
	if eventType != "session_configured" {
		return "", "", ""
	}
	return p.Params.Msg.Model, p.Params.Msg.CWD, p.Params.Msg.ApprovalPolicy
}

// writeSessionTitle dispatches to the title-write variant matching the
// event's priority: thread_name_updated wins unconditionally, while
// session_configured.thread_name and user_message fall back to
// fill-if-empty. Other events contribute no title.
func writeSessionTitle(ctx context.Context, app *hub.App, sessionID, eventType string, p parsedPayload) {
	switch eventType {
	case "thread_name_updated":
		if p.Params.Msg.ThreadName != "" {
			_ = app.Store.SetSessionTitleAlways(ctx, sessionID, p.Params.Msg.ThreadName)
		}
	case "session_configured":
		if p.Params.Msg.ThreadName != "" {
			_ = app.Store.SetSessionTitleIfEmpty(ctx, sessionID, p.Params.Msg.ThreadName)
		}
	case "user_message":
		if s := summarizeForTitle(p.Params.Msg.Message); s != "" {
			_ = app.Store.SetSessionTitleIfEmpty(ctx, sessionID, s)
		}
	}
}

func summarizeForTitle(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	joined := strings.Join(strings.Fields(s), " ")
	const max = 80
	if len(joined) <= max {
		return joined
	}
	return joined[:max] + "…"
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
