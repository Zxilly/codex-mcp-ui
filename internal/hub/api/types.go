package api

import "encoding/json"

// HandshakeResponse is the identity/capability payload returned by
// GET /api/v1/handshake. Both the hub and proxy depend on this exact shape.
type HandshakeResponse struct {
	Service         string   `json:"service"`
	ProtocolVersion string   `json:"protocolVersion"`
	AppVersion      string   `json:"appVersion"`
	Capabilities    []string `json:"capabilities"`
	InstanceID      string   `json:"instanceId"`
	PID             int      `json:"pid"`
	DataDir         string   `json:"dataDir"`
}

// StatusResponse is returned by GET /api/v1/status for `server status`.
type StatusResponse struct {
	Service       string `json:"service"`
	AppVersion    string `json:"appVersion"`
	PID           int    `json:"pid"`
	DataDir       string `json:"dataDir"`
	InstanceID    string `json:"instanceId"`
	UIPort        int    `json:"uiPort"`
	ActiveProxies int    `json:"activeProxies"`
}

// RequiredCapabilities are the capabilities a proxy must find in a hub's
// handshake response to treat it as compatible.
var RequiredCapabilities = []string{"ingest.events", "admin.stop"}

// ClientSourceRegistration describes the stable identity the proxy wants
// the hub to record for the client source it is attached to. Sent on
// /api/v1/ingest/register, which is loopback-only, so wire format uses
// snake_case to match the rest of the ingest surface.
type ClientSourceRegistration struct {
	ClientSourceKey  string `json:"source_key"`
	PID              int    `json:"pid"`
	ProtocolVersion  string `json:"protocol_version"`
	ClientName       string `json:"client_name"`
	ClientVersion    string `json:"client_version"`
	CapabilitiesJSON string `json:"capabilities_json"`
	ExecutablePath   string `json:"executable_path,omitempty"`
	CommandLine      string `json:"command_line,omitempty"`
	CWD              string `json:"cwd,omitempty"`
}

// --- UI-facing DTOs (snake_case per dashboard/types.ts) ---

// ItemsResponse wraps list endpoints so the dashboard can add pagination
// metadata later without breaking the wire format.
type ItemsResponse[T any] struct {
	Items []T `json:"items"`
}

type ClientSourceDTO struct {
	SourceKey       string `json:"source_key"`
	ClientName      string `json:"client_name"`
	PID             int    `json:"pid"`
	ProtocolVersion string `json:"protocol_version,omitempty"`
	Executable      string `json:"executable,omitempty"`
	CWD             string `json:"cwd,omitempty"`
	FirstSeen       string `json:"first_seen"`
	LastSeen        string `json:"last_seen"`
	SessionCount    int    `json:"session_count"`
}

type SessionDTO struct {
	ThreadID       string `json:"thread_id"`
	SourceKey      string `json:"source_key"`
	Title          string `json:"title,omitempty"`
	Model          string `json:"model,omitempty"`
	CWD            string `json:"cwd,omitempty"`
	ApprovalPolicy string `json:"approval_policy,omitempty"`
	Sandbox        string `json:"sandbox,omitempty"`
	FirstSeen      string `json:"first_seen"`
	LastSeen       string `json:"last_seen"`
	Status         string `json:"status,omitempty"`
}

type EventRecordDTO struct {
	EventID         string          `json:"event_id"`
	Timestamp       string          `json:"timestamp"`
	ProxyInstanceID string          `json:"proxy_instance_id"`
	SourceKey       string          `json:"source_key"`
	ThreadID        string          `json:"thread_id,omitempty"`
	TurnID          string          `json:"turn_id,omitempty"`
	RequestID       string          `json:"request_id,omitempty"`
	Direction       string          `json:"direction"`
	Category        string          `json:"category"`
	EventType       string          `json:"event_type,omitempty"`
	CommandCallID   string          `json:"command_call_id,omitempty"`
	ToolCallID      string          `json:"tool_call_id,omitempty"`
	Payload         json.RawMessage `json:"payload"`
}

type SessionDetailDTO struct {
	Session      SessionDTO       `json:"session"`
	ClientSource ClientSourceDTO  `json:"client_source"`
	RecentEvents []EventRecordDTO `json:"recent_events"`
}

type ProxyDTO struct {
	ProxyInstanceID string `json:"proxy_instance_id"`
	SourceKey       string `json:"source_key,omitempty"`
	PID             int    `json:"pid"`
	StartedAt       string `json:"started_at"`
	LastHeartbeatAt string `json:"last_heartbeat_at"`
	ExitedAt        string `json:"exited_at,omitempty"`
}
