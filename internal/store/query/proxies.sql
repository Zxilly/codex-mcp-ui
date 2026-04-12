-- name: RegisterProxy :exec
INSERT INTO proxy_instances (
  proxy_instance_id, client_source_key, pid, started_at, last_heartbeat_at
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(proxy_instance_id) DO UPDATE SET
  client_source_key = excluded.client_source_key,
  pid = excluded.pid,
  last_heartbeat_at = excluded.last_heartbeat_at,
  exited_at = NULL;

-- name: HeartbeatProxy :exec
UPDATE proxy_instances
SET last_heartbeat_at = ?
WHERE proxy_instance_id = ?;

-- name: MarkProxyExited :exec
UPDATE proxy_instances
SET exited_at = ?
WHERE proxy_instance_id = ?;

-- name: ListActiveProxies :many
SELECT proxy_instance_id, client_source_key, pid, started_at, last_heartbeat_at, exited_at
FROM proxy_instances
WHERE exited_at IS NULL
ORDER BY started_at DESC;

-- name: ListAllProxies :many
SELECT proxy_instance_id, client_source_key, pid, started_at, last_heartbeat_at, exited_at
FROM proxy_instances
ORDER BY started_at DESC;
