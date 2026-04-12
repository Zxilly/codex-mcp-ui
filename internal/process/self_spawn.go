package process

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
)

// SpawnDetachedHub launches `codex-mcp-ui hub serve --ui-port <port>` as a
// detached background process using the currently-running executable. The
// returned PID belongs to the spawned hub, which continues to run after the
// caller exits.
func SpawnDetachedHub(uiPort int) (int, error) {
	exe, err := os.Executable()
	if err != nil {
		return 0, fmt.Errorf("locate self executable: %w", err)
	}
	args := []string{"hub", "serve", "--ui-port", strconv.Itoa(uiPort)}
	cmd := exec.Command(exe, args...)
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	configureDetached(cmd)
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("spawn hub: %w", err)
	}
	pid := cmd.Process.Pid
	// Release the handle so the child keeps running after we exit.
	_ = cmd.Process.Release()
	return pid, nil
}
