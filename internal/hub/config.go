package hub

import "time"

// Config captures the runtime settings for a hub process.
type Config struct {
	// UIPort is the loopback port the hub binds to. Zero means an
	// automatic port (used in tests).
	UIPort int
	// DataDir is the directory used for the SQLite database and any
	// other per-hub persistent state.
	DataDir string
	// IdleTimeout shuts the hub down after this duration with no
	// observed API activity. Zero disables idle shutdown.
	IdleTimeout time.Duration
}
