-- name: UpsertClientSource :exec
INSERT INTO client_sources (
  client_source_key, pid, protocol_version, client_name, client_version,
  capabilities_json, executable_path, command_line, cwd,
  first_seen_at, last_seen_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(client_source_key) DO UPDATE SET
  pid = excluded.pid,
  protocol_version = excluded.protocol_version,
  client_name = excluded.client_name,
  client_version = excluded.client_version,
  capabilities_json = excluded.capabilities_json,
  executable_path = excluded.executable_path,
  command_line = excluded.command_line,
  cwd = excluded.cwd,
  last_seen_at = excluded.last_seen_at;

-- name: ListClientSources :many
SELECT client_source_key, pid, protocol_version, client_name, client_version,
       capabilities_json, executable_path, command_line, cwd,
       first_seen_at, last_seen_at
FROM client_sources
ORDER BY last_seen_at DESC;

-- name: GetClientSource :one
SELECT client_source_key, pid, protocol_version, client_name, client_version,
       capabilities_json, executable_path, command_line, cwd,
       first_seen_at, last_seen_at
FROM client_sources
WHERE client_source_key = ?;
