-- +goose Up
DROP INDEX IF EXISTS idx_events_session_time;
CREATE INDEX IF NOT EXISTS idx_events_session_time_event_id ON events(session_id, occurred_at, event_id);

-- +goose Down
DROP INDEX IF EXISTS idx_events_session_time_event_id;
CREATE INDEX IF NOT EXISTS idx_events_session_time ON events(session_id, occurred_at);
