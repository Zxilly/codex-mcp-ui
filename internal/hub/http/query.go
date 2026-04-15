package http

import (
	"encoding/json"
	nethttp "net/http"
	"strconv"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/codex/codex-mcp-ui/internal/hub"
	"github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/store/sqlite"
)

func clientSourcesHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		items := []api.ClientSourceDTO{}
		if app.Store != nil {
			sources, err := app.Store.ListClientSourcesWithSessionCounts(r.Context())
			if err != nil {
				nethttp.Error(w, err.Error(), nethttp.StatusInternalServerError)
				return
			}
			for _, cs := range sources {
				items = append(items, toClientSourceDTO(cs.ClientSourceRecord, cs.SessionCount))
			}
		}
		writeJSON(w, nethttp.StatusOK, api.ItemsResponse[api.ClientSourceDTO]{Items: items})
	}
}

func sessionsForClientSourceHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		items := []api.SessionDTO{}
		if app.Store != nil {
			key := r.PathValue("sourceKey")
			rows, err := app.Store.ListSessionsBySource(r.Context(), key)
			if err != nil {
				nethttp.Error(w, err.Error(), nethttp.StatusInternalServerError)
				return
			}
			for _, s := range rows {
				items = append(items, toSessionDTO(s))
			}
		}
		writeJSON(w, nethttp.StatusOK, api.ItemsResponse[api.SessionDTO]{Items: items})
	}
}

func sessionDetailHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		if app.Store == nil {
			nethttp.Error(w, "hub has no persistent store", nethttp.StatusServiceUnavailable)
			return
		}
		threadID := r.PathValue("threadId")
		session, err := app.Store.GetSession(r.Context(), threadID)
		if err != nil {
			nethttp.Error(w, "session not found: "+err.Error(), nethttp.StatusNotFound)
			return
		}
		// Run the three remaining lookups concurrently — they're independent
		// once the session row is in hand.
		g, gctx := errgroup.WithContext(r.Context())
		var (
			source sqlite.ClientSourceRecord
			count  int
			events []sqlite.EventRecord
		)
		g.Go(func() error {
			var err error
			source, err = app.Store.GetClientSource(gctx, session.ClientSourceKey)
			return err
		})
		g.Go(func() error {
			var err error
			count, err = app.Store.CountSessionsByClientSource(gctx, session.ClientSourceKey)
			if err != nil {
				// Non-fatal; fall back to zero count.
				count = 0
				return nil
			}
			return nil
		})
		g.Go(func() error {
			var err error
			events, err = app.Store.ListSessionEvents(gctx, threadID, 100, "")
			return err
		})
		if err := g.Wait(); err != nil {
			nethttp.Error(w, err.Error(), nethttp.StatusInternalServerError)
			return
		}
		recent := make([]api.EventRecordDTO, 0, len(events))
		for _, e := range events {
			recent = append(recent, toEventDTO(e))
		}
		writeJSON(w, nethttp.StatusOK, api.SessionDetailDTO{
			Session:      toSessionDTO(session),
			ClientSource: toClientSourceDTO(source, count),
			RecentEvents: recent,
		})
	}
}

func proxiesHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		items := []api.ProxyDTO{}
		if app.Store != nil {
			rows, err := app.Store.ListActiveProxies(r.Context())
			if err != nil {
				nethttp.Error(w, err.Error(), nethttp.StatusInternalServerError)
				return
			}
			for _, p := range rows {
				items = append(items, api.ProxyDTO{
					ProxyInstanceID: p.ProxyInstanceID,
					SourceKey:       p.ClientSourceKey,
					PID:             p.PID,
					StartedAt:       unixMillisToISO(p.StartedAt),
					LastHeartbeatAt: unixMillisToISO(p.LastHeartbeatAt),
					ExitedAt:        unixMillisToISO(p.ExitedAt),
				})
			}
		}
		writeJSON(w, nethttp.StatusOK, api.ItemsResponse[api.ProxyDTO]{Items: items})
	}
}

func sessionEventsHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		if app.Store != nil {
			threadID := r.PathValue("threadId")
			limit := 100
			if v := r.URL.Query().Get("limit"); v != "" {
				if n, err := strconv.Atoi(v); err == nil && n > 0 {
					limit = n
				}
			}
			cursor := r.URL.Query().Get("cursor")
			if cursor == "" {
				cursor = r.URL.Query().Get("after")
			}
			if cursor == "" {
				cursor = r.URL.Query().Get("before")
			}
			if _, _, err := sqlite.ParseSessionEventCursor(cursor); err != nil {
				nethttp.Error(w, err.Error(), nethttp.StatusBadRequest)
				return
			}
			page, err := app.Store.ListSessionEventsPage(r.Context(), threadID, limit, cursor)
			if err != nil {
				nethttp.Error(w, err.Error(), nethttp.StatusInternalServerError)
				return
			}
			items := make([]api.EventRecordDTO, 0, len(page.Items))
			for _, e := range page.Items {
				items = append(items, toEventDTO(e))
			}
			writeJSON(w, nethttp.StatusOK, api.CursorItemsResponse[api.EventRecordDTO]{
				Cursor:     cursor,
				Items:      items,
				NextCursor: page.NextCursor,
			})
			return
		}
		writeJSON(w, nethttp.StatusOK, api.CursorItemsResponse[api.EventRecordDTO]{Items: []api.EventRecordDTO{}})
	}
}

func toClientSourceDTO(r sqlite.ClientSourceRecord, sessionCount int) api.ClientSourceDTO {
	return api.ClientSourceDTO{
		SourceKey:       r.ClientSourceKey,
		ClientName:      r.ClientName,
		PID:             r.PID,
		ProtocolVersion: r.ProtocolVersion,
		Executable:      r.ExecutablePath,
		CWD:             r.CWD,
		FirstSeen:       unixMillisToISO(r.FirstSeenAt),
		LastSeen:        unixMillisToISO(r.LastSeenAt),
		SessionCount:    sessionCount,
	}
}

func toSessionDTO(r sqlite.SessionRecord) api.SessionDTO {
	return api.SessionDTO{
		ThreadID:       r.SessionID,
		SourceKey:      r.ClientSourceKey,
		Title:          r.Title,
		Model:          r.Model,
		CWD:            r.CWD,
		ApprovalPolicy: r.ApprovalPolicy,
		FirstSeen:      unixMillisToISO(r.FirstSeenAt),
		LastSeen:       unixMillisToISO(r.LastSeenAt),
	}
}

func toEventDTO(r sqlite.EventRecord) api.EventRecordDTO {
	category := r.Category
	if category == "" {
		category = categoryForEvent(r)
	}
	return api.EventRecordDTO{
		EventID:         r.EventID,
		Timestamp:       unixMillisToISO(r.OccurredAt),
		ProxyInstanceID: r.ProxyInstanceID,
		SourceKey:       r.ClientSourceKey,
		ThreadID:        r.SessionID,
		TurnID:          r.TurnID,
		RequestID:       r.RequestID,
		Direction:       r.Direction,
		Category:        category,
		EventType:       r.EventType,
		CommandCallID:   r.CommandCallID,
		ToolCallID:      r.ToolCallID,
		Payload:         json.RawMessage(r.RawJSON),
	}
}

// categoryForEvent infers the category from the persisted EventRecord.
// We don't store category separately today; the ingest layer sets it on
// the live SSE payload while the read-back path re-derives a best guess.
// Event type names mirror codex-rs/protocol/src/protocol.rs EventMsg.
func categoryForEvent(r sqlite.EventRecord) string {
	switch r.EventType {
	case "", "raw_frame":
		return "raw_frame"
	case "response":
		return "response"
	case "error":
		return "error"
	case "codex/event",
		"session_configured",
		"task_started", "turn_started",
		"task_complete", "turn_complete",
		"token_count",
		"agent_message", "agent_message_delta", "agent_message_content_delta",
		"user_message",
		"agent_reasoning", "agent_reasoning_delta",
		"agent_reasoning_raw_content", "agent_reasoning_raw_content_delta",
		"agent_reasoning_section_break",
		"reasoning_content_delta", "reasoning_raw_content_delta",
		"exec_command_begin", "exec_command_output_delta", "exec_command_end",
		"exec_approval_request",
		"mcp_tool_call_begin", "mcp_tool_call_end",
		"apply_patch_approval_request",
		"patch_apply_begin", "patch_apply_end",
		"plan_update", "plan_delta",
		"turn_aborted", "turn_diff",
		"stream_error",
		"web_search_begin", "web_search_end",
		"background_event":
		return "codex_event"
	default:
		return "jsonrpc_request"
	}
}

func unixMillisToISO(ms int64) string {
	if ms == 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano)
}
