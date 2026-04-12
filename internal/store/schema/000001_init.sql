-- +goose Up
CREATE TABLE proxy_instances (
  proxy_instance_id TEXT PRIMARY KEY,
  client_source_key TEXT,
  pid INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  last_heartbeat_at INTEGER NOT NULL,
  exited_at INTEGER
);

CREATE TABLE client_sources (
  client_source_key TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  protocol_version TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_version TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  executable_path TEXT,
  command_line TEXT,
  cwd TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE mcp_calls (
  request_id TEXT PRIMARY KEY,
  proxy_instance_id TEXT NOT NULL,
  client_source_key TEXT NOT NULL,
  session_id TEXT,
  tool_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  completion_status TEXT
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  client_source_key TEXT NOT NULL,
  model TEXT,
  cwd TEXT,
  approval_policy TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  proxy_instance_id TEXT NOT NULL,
  client_source_key TEXT,
  session_id TEXT,
  turn_id TEXT,
  request_id TEXT,
  direction TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  raw_json BLOB NOT NULL
);

CREATE INDEX idx_events_session_time ON events(session_id, occurred_at);
CREATE INDEX idx_mcp_calls_source ON mcp_calls(client_source_key);
CREATE INDEX idx_sessions_source ON sessions(client_source_key);

-- +goose Down
DROP INDEX IF EXISTS idx_sessions_source;
DROP INDEX IF EXISTS idx_mcp_calls_source;
DROP INDEX IF EXISTS idx_events_session_time;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS mcp_calls;
DROP TABLE IF EXISTS client_sources;
DROP TABLE IF EXISTS proxy_instances;
