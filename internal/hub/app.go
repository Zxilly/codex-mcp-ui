package hub

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/store/sqlite"
	"github.com/codex/codex-mcp-ui/internal/version"
)

// App is the process-wide hub state shared by HTTP handlers.
type App struct {
	Config     Config
	InstanceID string
	PID        int
	Store      *sqlite.Store
	Broker     *Broker
	// ShutdownCh is closed when an admin shutdown is requested or when
	// the idle watcher decides the hub is unused.
	ShutdownCh chan struct{}

	stopOnce sync.Once
	touchCh  chan struct{}
}

func NewApp(cfg Config) (*App, error) {
	id, err := newInstanceID()
	if err != nil {
		return nil, err
	}
	dataDir, err := ResolveDataDir(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	cfg.DataDir = dataDir

	app := &App{
		Config:     cfg,
		InstanceID: id,
		PID:        os.Getpid(),
		Broker:     NewBroker(512),
		ShutdownCh: make(chan struct{}),
		touchCh:    make(chan struct{}, 1),
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	dbPath := filepath.Join(dataDir, "codex-mcp-ui.db")
	store, err := sqlite.Open(dbPath)
	if err != nil {
		return nil, err
	}
	app.Store = store
	return app, nil
}

func (a *App) Handshake() api.HandshakeResponse {
	return api.HandshakeResponse{
		Service:         version.ServiceName,
		ProtocolVersion: version.ProtocolVersion,
		AppVersion:      version.AppVersion,
		Capabilities:    append([]string(nil), api.RequiredCapabilities...),
		InstanceID:      a.InstanceID,
		PID:             a.PID,
		DataDir:         a.Config.DataDir,
	}
}

// Touch resets the idle watcher so the hub does not shut itself down
// while traffic is flowing. Safe to call from any goroutine.
func (a *App) Touch() {
	select {
	case a.touchCh <- struct{}{}:
	default:
	}
}

// TriggerShutdown closes ShutdownCh at most once so callers can signal
// an admin-requested or idle-timeout shutdown without risking a double close.
func (a *App) TriggerShutdown() {
	a.stopOnce.Do(func() { close(a.ShutdownCh) })
}

func (a *App) IsStopped() bool {
	select {
	case <-a.ShutdownCh:
		return true
	default:
		return false
	}
}

// StartIdleWatcher spawns a goroutine that triggers shutdown when no
// Touch call arrives within the configured IdleTimeout. A zero or negative
// IdleTimeout disables the watcher.
func (a *App) StartIdleWatcher(ctx context.Context) {
	if a.Config.IdleTimeout <= 0 {
		return
	}
	timeout := a.Config.IdleTimeout
	go func() {
		timer := time.NewTimer(timeout)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-a.ShutdownCh:
				return
			case <-a.touchCh:
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(timeout)
			case <-timer.C:
				a.TriggerShutdown()
				return
			}
		}
	}()
}

func newInstanceID() (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "hub-" + hex.EncodeToString(buf[:]), nil
}
