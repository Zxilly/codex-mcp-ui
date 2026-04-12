package hub

import (
	"fmt"
	"os"
	"path/filepath"
)

// DefaultDataDirName is the directory name under the user's home folder when
// Config.DataDir is empty.
const DefaultDataDirName = ".codex-mcp-ui"

// ResolveDataDir returns the absolute directory used for SQLite and other hub
// files. An empty dir selects filepath.Join(os.UserHomeDir(), DefaultDataDirName).
func ResolveDataDir(dir string) (string, error) {
	if dir != "" {
		abs, err := filepath.Abs(filepath.Clean(dir))
		if err != nil {
			return "", fmt.Errorf("data directory: %w", err)
		}
		return abs, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("user home directory: %w", err)
	}
	return filepath.Join(home, DefaultDataDirName), nil
}
