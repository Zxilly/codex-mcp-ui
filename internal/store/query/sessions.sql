-- name: UpsertSession :exec
INSERT INTO sessions (
  session_id, client_source_key, model, cwd, approval_policy,
  first_seen_at, last_seen_at
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(session_id) DO UPDATE SET
  client_source_key = excluded.client_source_key,
  model = COALESCE(excluded.model, sessions.model),
  cwd = COALESCE(excluded.cwd, sessions.cwd),
  approval_policy = COALESCE(excluded.approval_policy, sessions.approval_policy),
  last_seen_at = excluded.last_seen_at;

-- name: GetSession :one
SELECT session_id, client_source_key, model, cwd, approval_policy,
       first_seen_at, last_seen_at
FROM sessions
WHERE session_id = ?;

-- name: ListSessionsBySource :many
SELECT session_id, client_source_key, model, cwd, approval_policy,
       first_seen_at, last_seen_at
FROM sessions
WHERE client_source_key = ?
ORDER BY last_seen_at DESC;
