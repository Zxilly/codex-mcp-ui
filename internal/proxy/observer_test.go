package proxy

import (
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// waitFor retries the predicate until it returns true or the deadline expires.
func waitFor(t *testing.T, d time.Duration, msg string, pred func() bool) {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if pred() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("condition not met within %s: %s", d, msg)
}

func TestObserverShipsFramesToHub(t *testing.T) {
	var received atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/ingest/events", r.URL.Path)
		received.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	obs := NewObserver(ObserverConfig{
		ProxyInstanceID: "proxy-1",
		ClientSourceKey: "src-1",
		HubClient:       NewHubClient(srv.URL),
	})
	obs.OnFrame("downstream", []byte(`{"jsonrpc":"2.0","id":1,"result":{}}`))

	waitFor(t, time.Second, "event shipped", func() bool { return received.Load() == 1 })
}

func TestObserverNoHubClientIsSilentNoop(t *testing.T) {
	obs := NewObserver(ObserverConfig{ProxyInstanceID: "p"})
	obs.OnFrame("upstream", []byte(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
	time.Sleep(20 * time.Millisecond)
	// No panic, no crash — enough. Degraded stays false because ship returns
	// early without attempting a post.
	require.False(t, obs.degraded.Load())
}

func TestObserverEntersDegradedWhenHubReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	var logMu sync.Mutex
	var logBuf strings.Builder
	logger := log.New(&syncWriter{mu: &logMu, w: &logBuf}, "", 0)

	obs := NewObserver(ObserverConfig{
		ProxyInstanceID: "p",
		HubClient:       NewHubClient(srv.URL),
		Logger:          logger,
	})
	obs.OnFrame("downstream", []byte(`{"jsonrpc":"2.0","id":1,"result":{}}`))
	waitFor(t, time.Second, "degraded log emitted", func() bool {
		logMu.Lock()
		defer logMu.Unlock()
		return strings.Contains(logBuf.String(), "hub ingest degraded")
	})
	require.True(t, obs.degraded.Load())
}

func TestObserverLogsRecoveryExactlyOnceAfterHubComesBack(t *testing.T) {
	var reject atomic.Bool
	reject.Store(true)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if reject.Load() {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	var logBuf strings.Builder
	var logMu sync.Mutex
	logger := log.New(&syncWriter{mu: &logMu, w: &logBuf}, "", 0)

	obs := NewObserver(ObserverConfig{HubClient: NewHubClient(srv.URL), Logger: logger})
	obs.OnFrame("downstream", []byte(`{}`))
	waitFor(t, time.Second, "degraded", obs.degraded.Load)

	reject.Store(false)
	obs.OnFrame("downstream", []byte(`{}`))
	waitFor(t, time.Second, "recovered", func() bool { return !obs.degraded.Load() })

	logMu.Lock()
	logs := logBuf.String()
	logMu.Unlock()
	require.Equal(t, 1, strings.Count(logs, "hub ingest degraded"))
	require.Equal(t, 1, strings.Count(logs, "hub ingest recovered"))
}

func TestObserverDropsOverflowInsteadOfBlocking(t *testing.T) {
	// Hub blocks until release to simulate a stalled ingest. Overflow past
	// shipQueueSize (1024) must go to the drop branch, not wedge OnFrame.
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		w.WriteHeader(http.StatusOK)
	}))
	defer func() { close(release); srv.Close() }()

	obs := NewObserver(ObserverConfig{HubClient: NewHubClient(srv.URL)})
	// Push 2x the queue size; OnFrame must return quickly even while the hub
	// is blocking, because the ship worker is stalled on the in-flight post.
	const burst = shipQueueSize * 2
	start := time.Now()
	for i := 0; i < burst; i++ {
		obs.OnFrame("downstream", []byte(`{}`))
	}
	elapsed := time.Since(start)
	require.Less(t, elapsed, 2*time.Second, "OnFrame must not block on a stalled hub")
	waitFor(t, 2*time.Second, "degraded state set after overflow", obs.degraded.Load)
}

// syncWriter guards concurrent writes to a shared Buffer from multiple
// goroutines (the ship worker + test goroutine).
type syncWriter struct {
	mu *sync.Mutex
	w  *strings.Builder
}

func (s *syncWriter) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.w.Write(p)
}
