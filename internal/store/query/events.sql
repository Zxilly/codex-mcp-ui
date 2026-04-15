-- name: AppendEvent :exec
INSERT INTO events (
  event_id, proxy_instance_id, client_source_key, session_id, turn_id,
  request_id, direction, event_type, occurred_at, raw_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: ListSessionEventsSince :many
SELECT event_id, proxy_instance_id, client_source_key, session_id, turn_id,
       request_id, direction, event_type, occurred_at, raw_json,
       category, command_call_id, tool_call_id
FROM events
WHERE session_id = ?
  AND (
    ? = 0
    OR occurred_at > ?
    OR (occurred_at = ? AND event_id > ?)
  )
ORDER BY occurred_at ASC, event_id ASC
LIMIT ?;

-- name: ListRecentEvents :many
SELECT event_id, proxy_instance_id, client_source_key, session_id, turn_id,
       request_id, direction, event_type, occurred_at, raw_json,
       category, command_call_id, tool_call_id
FROM events
ORDER BY occurred_at DESC
LIMIT ?;
