-- +goose Up
ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN command_call_id TEXT;
ALTER TABLE events ADD COLUMN tool_call_id TEXT;
CREATE INDEX idx_events_command_call_id ON events(command_call_id);
CREATE INDEX idx_events_tool_call_id ON events(tool_call_id);

-- +goose Down
DROP INDEX IF EXISTS idx_events_tool_call_id;
DROP INDEX IF EXISTS idx_events_command_call_id;
ALTER TABLE events DROP COLUMN tool_call_id;
ALTER TABLE events DROP COLUMN command_call_id;
ALTER TABLE events DROP COLUMN category;
