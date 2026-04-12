-- name: UpsertMCPCall :exec
INSERT INTO mcp_calls (
  request_id, proxy_instance_id, client_source_key, session_id,
  tool_name, started_at, completed_at, completion_status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(request_id) DO UPDATE SET
  session_id = COALESCE(excluded.session_id, mcp_calls.session_id),
  completed_at = COALESCE(excluded.completed_at, mcp_calls.completed_at),
  completion_status = COALESCE(excluded.completion_status, mcp_calls.completion_status);

-- name: CompleteMCPCall :exec
UPDATE mcp_calls
SET completed_at = ?, completion_status = ?
WHERE request_id = ?;

-- name: ListMCPCallsBySource :many
SELECT request_id, proxy_instance_id, client_source_key, session_id,
       tool_name, started_at, completed_at, completion_status
FROM mcp_calls
WHERE client_source_key = ?
ORDER BY started_at DESC;

-- name: ListRecentMCPCalls :many
SELECT request_id, proxy_instance_id, client_source_key, session_id,
       tool_name, started_at, completed_at, completion_status
FROM mcp_calls
ORDER BY started_at DESC
LIMIT ?;
