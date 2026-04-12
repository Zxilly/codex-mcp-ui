package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/codex/codex-mcp-ui/internal/store/sqlc"
)

// Store is the durable event persistence layer for the hub. It wraps the
// sqlc-generated queries with ergonomic record types used by the HTTP and
// ingest layers.
type Store struct {
	db *sql.DB
	q  *sqlc.Queries
}

func Open(path string) (*Store, error) {
	db, err := openDB(path)
	if err != nil {
		return nil, err
	}
	if err := runMigrations(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	q, err := sqlc.Prepare(context.Background(), db)
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("prepare sqlc statements: %w", err)
	}
	return &Store{db: db, q: q}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func now() int64 { return time.Now().UnixMilli() }

func newID(prefix string) string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return prefix + "-" + hex.EncodeToString(buf[:])
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullInt64(v int64) sql.NullInt64 {
	if v == 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: v, Valid: true}
}

// --- Proxy instances ---

type RegisterProxyParams struct {
	ProxyInstanceID string
	ClientSourceKey string
	PID             int
}

type ProxyInstance struct {
	ProxyInstanceID string
	ClientSourceKey string
	PID             int
	StartedAt       int64
	LastHeartbeatAt int64
	ExitedAt        int64
}

func (s *Store) RegisterProxy(ctx context.Context, p RegisterProxyParams) error {
	t := now()
	return s.q.RegisterProxy(ctx, sqlc.RegisterProxyParams{
		ProxyInstanceID: p.ProxyInstanceID,
		ClientSourceKey: nullString(p.ClientSourceKey),
		Pid:             int64(p.PID),
		StartedAt:       t,
		LastHeartbeatAt: t,
	})
}

func (s *Store) HeartbeatProxy(ctx context.Context, id string) error {
	return s.q.HeartbeatProxy(ctx, sqlc.HeartbeatProxyParams{
		LastHeartbeatAt: now(),
		ProxyInstanceID: id,
	})
}

func (s *Store) ListActiveProxies(ctx context.Context) ([]ProxyInstance, error) {
	rows, err := s.q.ListActiveProxies(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ProxyInstance, 0, len(rows))
	for _, r := range rows {
		out = append(out, ProxyInstance{
			ProxyInstanceID: r.ProxyInstanceID,
			ClientSourceKey: r.ClientSourceKey.String,
			PID:             int(r.Pid),
			StartedAt:       r.StartedAt,
			LastHeartbeatAt: r.LastHeartbeatAt,
			ExitedAt:        r.ExitedAt.Int64,
		})
	}
	return out, nil
}

// --- Client sources ---

type ClientSourceRecord struct {
	ClientSourceKey  string
	PID              int
	ProtocolVersion  string
	ClientName       string
	ClientVersion    string
	CapabilitiesJSON string
	ExecutablePath   string
	CommandLine      string
	CWD              string
	FirstSeenAt      int64
	LastSeenAt       int64
}

func (s *Store) UpsertClientSource(ctx context.Context, r ClientSourceRecord) error {
	t := now()
	return s.q.UpsertClientSource(ctx, sqlc.UpsertClientSourceParams{
		ClientSourceKey:  r.ClientSourceKey,
		Pid:              int64(r.PID),
		ProtocolVersion:  r.ProtocolVersion,
		ClientName:       r.ClientName,
		ClientVersion:    r.ClientVersion,
		CapabilitiesJson: r.CapabilitiesJSON,
		ExecutablePath:   nullString(r.ExecutablePath),
		CommandLine:      nullString(r.CommandLine),
		Cwd:              nullString(r.CWD),
		FirstSeenAt:      t,
		LastSeenAt:       t,
	})
}

func (s *Store) ListClientSources(ctx context.Context) ([]ClientSourceRecord, error) {
	rows, err := s.q.ListClientSources(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ClientSourceRecord, 0, len(rows))
	for _, r := range rows {
		out = append(out, ClientSourceRecord{
			ClientSourceKey:  r.ClientSourceKey,
			PID:              int(r.Pid),
			ProtocolVersion:  r.ProtocolVersion,
			ClientName:       r.ClientName,
			ClientVersion:    r.ClientVersion,
			CapabilitiesJSON: r.CapabilitiesJson,
			ExecutablePath:   r.ExecutablePath.String,
			CommandLine:      r.CommandLine.String,
			CWD:              r.Cwd.String,
			FirstSeenAt:      r.FirstSeenAt,
			LastSeenAt:       r.LastSeenAt,
		})
	}
	return out, nil
}

func (s *Store) GetClientSource(ctx context.Context, sourceKey string) (ClientSourceRecord, error) {
	r, err := s.q.GetClientSource(ctx, sourceKey)
	if err != nil {
		return ClientSourceRecord{}, err
	}
	return ClientSourceRecord{
		ClientSourceKey:  r.ClientSourceKey,
		PID:              int(r.Pid),
		ProtocolVersion:  r.ProtocolVersion,
		ClientName:       r.ClientName,
		ClientVersion:    r.ClientVersion,
		CapabilitiesJSON: r.CapabilitiesJson,
		ExecutablePath:   r.ExecutablePath.String,
		CommandLine:      r.CommandLine.String,
		CWD:              r.Cwd.String,
		FirstSeenAt:      r.FirstSeenAt,
		LastSeenAt:       r.LastSeenAt,
	}, nil
}

func (s *Store) CountSessionsByClientSource(ctx context.Context, sourceKey string) (int, error) {
	row := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE client_source_key = ?`, sourceKey)
	var n int
	if err := row.Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// ClientSourceWithSessionCount mirrors ClientSourceRecord but carries the
// aggregated session count so the dashboard list endpoint can render in
// one database round-trip.
type ClientSourceWithSessionCount struct {
	ClientSourceRecord
	SessionCount int
}

func (s *Store) ListClientSourcesWithSessionCounts(ctx context.Context) ([]ClientSourceWithSessionCount, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT
		c.client_source_key, c.pid, c.protocol_version, c.client_name, c.client_version,
		c.capabilities_json, c.executable_path, c.command_line, c.cwd,
		c.first_seen_at, c.last_seen_at,
		COUNT(sess.session_id) AS session_count
	FROM client_sources c
	LEFT JOIN sessions sess ON sess.client_source_key = c.client_source_key
	GROUP BY c.client_source_key
	ORDER BY c.last_seen_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ClientSourceWithSessionCount, 0)
	for rows.Next() {
		var (
			r              ClientSourceWithSessionCount
			execPath, cmdL sql.NullString
			cwd            sql.NullString
			pid            int64
		)
		if err := rows.Scan(&r.ClientSourceKey, &pid, &r.ProtocolVersion, &r.ClientName, &r.ClientVersion,
			&r.CapabilitiesJSON, &execPath, &cmdL, &cwd,
			&r.FirstSeenAt, &r.LastSeenAt, &r.SessionCount); err != nil {
			return nil, err
		}
		r.PID = int(pid)
		r.ExecutablePath = execPath.String
		r.CommandLine = cmdL.String
		r.CWD = cwd.String
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- MCP calls ---

type MCPCallRecord struct {
	RequestID        string
	ProxyInstanceID  string
	ClientSourceKey  string
	SessionID        string
	ToolName         string
	StartedAt        int64
	CompletedAt      int64
	CompletionStatus string
}

func (s *Store) UpsertMCPCall(ctx context.Context, r MCPCallRecord) error {
	if r.StartedAt == 0 {
		r.StartedAt = now()
	}
	return s.q.UpsertMCPCall(ctx, sqlc.UpsertMCPCallParams{
		RequestID:        r.RequestID,
		ProxyInstanceID:  r.ProxyInstanceID,
		ClientSourceKey:  r.ClientSourceKey,
		SessionID:        nullString(r.SessionID),
		ToolName:         r.ToolName,
		StartedAt:        r.StartedAt,
		CompletedAt:      nullInt64(r.CompletedAt),
		CompletionStatus: nullString(r.CompletionStatus),
	})
}

func (s *Store) ListMCPCallsBySource(ctx context.Context, sourceKey string) ([]MCPCallRecord, error) {
	rows, err := s.q.ListMCPCallsBySource(ctx, sourceKey)
	if err != nil {
		return nil, err
	}
	out := make([]MCPCallRecord, 0, len(rows))
	for _, r := range rows {
		out = append(out, MCPCallRecord{
			RequestID:        r.RequestID,
			ProxyInstanceID:  r.ProxyInstanceID,
			ClientSourceKey:  r.ClientSourceKey,
			SessionID:        r.SessionID.String,
			ToolName:         r.ToolName,
			StartedAt:        r.StartedAt,
			CompletedAt:      r.CompletedAt.Int64,
			CompletionStatus: r.CompletionStatus.String,
		})
	}
	return out, nil
}

func (s *Store) CompleteMCPCall(ctx context.Context, requestID string, completedAt int64, status string) error {
	if completedAt == 0 {
		completedAt = now()
	}
	return s.q.CompleteMCPCall(ctx, sqlc.CompleteMCPCallParams{
		CompletedAt:      nullInt64(completedAt),
		CompletionStatus: nullString(status),
		RequestID:        requestID,
	})
}

// --- Sessions ---

type SessionRecord struct {
	SessionID       string
	ClientSourceKey string
	Model           string
	CWD             string
	ApprovalPolicy  string
	Title           string
	FirstSeenAt     int64
	LastSeenAt      int64
}

// BackfillSessionsFromEvents reconstructs missing rows in the sessions table
// from any events that reference an unknown session_id. This lets databases
// written by older hub versions — which ingested events but never populated
// sessions — show up in the dashboard on next startup. Once any session row
// exists we assume the live ingest path is keeping sessions in sync and skip
// the GROUP BY scan to avoid paying for it on every hub start.
func (s *Store) BackfillSessionsFromEvents(ctx context.Context) (int64, error) {
	var have int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions`).Scan(&have); err != nil {
		return 0, err
	}
	if have > 0 {
		return 0, nil
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO sessions (session_id, client_source_key, first_seen_at, last_seen_at)
		SELECT
			e.session_id,
			COALESCE(e.client_source_key, ''),
			MIN(e.occurred_at),
			MAX(e.occurred_at)
		FROM events e
		WHERE e.session_id IS NOT NULL
		  AND e.session_id != ''
		  AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.session_id = e.session_id)
		GROUP BY e.session_id
	`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// SetSessionTitleAlways writes the session's display title unconditionally,
// overwriting any previous value. Use for authoritative sources such as
// Codex's thread_name_updated event. Callers must have already
// UpsertSession'd the row so the UPDATE has a target.
func (s *Store) SetSessionTitleAlways(ctx context.Context, sessionID, title string) error {
	if sessionID == "" || title == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE sessions SET title = ? WHERE session_id = ?`,
		title, sessionID)
	return err
}

// SetSessionTitleIfEmpty fills the title only when the row has none yet.
// Use for fallback sources such as session_configured.thread_name or the
// first user_message text, where a later authoritative rename must still win.
func (s *Store) SetSessionTitleIfEmpty(ctx context.Context, sessionID, title string) error {
	if sessionID == "" || title == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE sessions SET title = ? WHERE session_id = ? AND (title IS NULL OR title = '')`,
		title, sessionID)
	return err
}

func (s *Store) UpsertSession(ctx context.Context, r SessionRecord) error {
	t := now()
	return s.q.UpsertSession(ctx, sqlc.UpsertSessionParams{
		SessionID:       r.SessionID,
		ClientSourceKey: r.ClientSourceKey,
		Model:           nullString(r.Model),
		Cwd:             nullString(r.CWD),
		ApprovalPolicy:  nullString(r.ApprovalPolicy),
		FirstSeenAt:     t,
		LastSeenAt:      t,
	})
}

func (s *Store) GetSession(ctx context.Context, sessionID string) (SessionRecord, error) {
	r, err := s.q.GetSession(ctx, sessionID)
	if err != nil {
		return SessionRecord{}, err
	}
	return SessionRecord{
		SessionID:       r.SessionID,
		ClientSourceKey: r.ClientSourceKey,
		Model:           r.Model.String,
		CWD:             r.Cwd.String,
		ApprovalPolicy:  r.ApprovalPolicy.String,
		Title:           r.Title.String,
		FirstSeenAt:     r.FirstSeenAt,
		LastSeenAt:      r.LastSeenAt,
	}, nil
}

func (s *Store) ListSessionsBySource(ctx context.Context, sourceKey string) ([]SessionRecord, error) {
	rows, err := s.q.ListSessionsBySource(ctx, sourceKey)
	if err != nil {
		return nil, err
	}
	out := make([]SessionRecord, 0, len(rows))
	for _, r := range rows {
		out = append(out, SessionRecord{
			SessionID:       r.SessionID,
			ClientSourceKey: r.ClientSourceKey,
			Model:           r.Model.String,
			CWD:             r.Cwd.String,
			ApprovalPolicy:  r.ApprovalPolicy.String,
			Title:           r.Title.String,
			FirstSeenAt:     r.FirstSeenAt,
			LastSeenAt:      r.LastSeenAt,
		})
	}
	return out, nil
}

// --- Events ---

type EventRecord struct {
	EventID         string
	ProxyInstanceID string
	ClientSourceKey string
	SessionID       string
	TurnID          string
	RequestID       string
	Direction       string
	EventType       string
	Category        string
	CommandCallID   string
	ToolCallID      string
	OccurredAt      int64
	RawJSON         []byte
}

// AppendEvent persists r and returns the EventID actually written (useful
// when the caller left it blank and the store generated one).
func (s *Store) AppendEvent(ctx context.Context, r EventRecord) error {
	_, err := s.AppendEventReturningID(ctx, r)
	return err
}

func (s *Store) AppendEventReturningID(ctx context.Context, r EventRecord) (string, error) {
	if r.EventID == "" {
		r.EventID = newID("evt")
	}
	if r.OccurredAt == 0 {
		r.OccurredAt = now()
	}
	if r.Direction == "" {
		r.Direction = "codex_to_upstream"
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO events (
		event_id, proxy_instance_id, client_source_key, session_id, turn_id,
		request_id, direction, event_type, occurred_at, raw_json,
		category, command_call_id, tool_call_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.EventID, r.ProxyInstanceID, nullString(r.ClientSourceKey), nullString(r.SessionID), nullString(r.TurnID),
		nullString(r.RequestID), r.Direction, r.EventType, r.OccurredAt, r.RawJSON,
		r.Category, nullString(r.CommandCallID), nullString(r.ToolCallID))
	return r.EventID, err
}

func (s *Store) ListSessionEvents(ctx context.Context, sessionID string, limit int, afterEventID string) ([]EventRecord, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `SELECT
		event_id, proxy_instance_id, client_source_key, session_id, turn_id,
		request_id, direction, event_type, occurred_at, raw_json,
		category, command_call_id, tool_call_id
	FROM events
	WHERE session_id = ? AND (? = '' OR event_id > ?)
	ORDER BY occurred_at ASC, event_id ASC
	LIMIT ?`, sessionID, afterEventID, afterEventID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]EventRecord, 0)
	for rows.Next() {
		var (
			r              EventRecord
			clientSourceNS sql.NullString
			sessionNS      sql.NullString
			turnNS         sql.NullString
			requestNS      sql.NullString
			commandCallNS  sql.NullString
			toolCallNS     sql.NullString
		)
		if err := rows.Scan(&r.EventID, &r.ProxyInstanceID, &clientSourceNS, &sessionNS,
			&turnNS, &requestNS, &r.Direction, &r.EventType, &r.OccurredAt, &r.RawJSON,
			&r.Category, &commandCallNS, &toolCallNS); err != nil {
			return nil, err
		}
		r.ClientSourceKey = clientSourceNS.String
		r.SessionID = sessionNS.String
		r.TurnID = turnNS.String
		r.RequestID = requestNS.String
		r.CommandCallID = commandCallNS.String
		r.ToolCallID = toolCallNS.String
		out = append(out, r)
	}
	return out, rows.Err()
}
