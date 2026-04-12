package hub

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestHubShutsDownAfterIdleTimeout(t *testing.T) {
	app, err := NewApp(Config{DataDir: t.TempDir(), IdleTimeout: 50 * time.Millisecond})
	require.NoError(t, err)
	t.Cleanup(func() {
		if app.Store != nil {
			_ = app.Store.Close()
		}
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	app.StartIdleWatcher(ctx)

	require.Eventually(t, app.IsStopped, time.Second, 10*time.Millisecond,
		"app should mark itself stopped after idle timeout elapses")
}

func TestHubTouchResetsIdleTimer(t *testing.T) {
	app, err := NewApp(Config{DataDir: t.TempDir(), IdleTimeout: 80 * time.Millisecond})
	require.NoError(t, err)
	t.Cleanup(func() {
		if app.Store != nil {
			_ = app.Store.Close()
		}
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	app.StartIdleWatcher(ctx)

	// Touch every 20ms for 200ms — longer than idle timeout.
	stop := time.After(200 * time.Millisecond)
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	for done := false; !done; {
		select {
		case <-tick.C:
			app.Touch()
		case <-stop:
			done = true
		}
	}
	require.False(t, app.IsStopped(), "touches should keep the app alive")
}
