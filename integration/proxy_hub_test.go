package integration

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/codex/codex-mcp-ui/internal/hub"
	hubhttp "github.com/codex/codex-mcp-ui/internal/hub/http"
	"github.com/codex/codex-mcp-ui/internal/proxy"
)

type endToEndHarness struct {
	t             *testing.T
	hubURL        string
	app           *hub.App
	srv           *httptest.Server
	proxyID       string
	clientSource  string
	ctx           context.Context
	cancel        context.CancelFunc
	upstreamR     *io.PipeReader
	upstreamW     *io.PipeWriter
	downstreamR   *io.PipeReader
	downstreamW   *io.PipeWriter
	bridgeDone    <-chan struct{}
	upstreamOutCh chan string
}

func newEndToEndHarness(t *testing.T) *endToEndHarness {
	t.Helper()
	app, err := hub.NewApp(hub.Config{UIPort: 0, DataDir: t.TempDir()})
	require.NoError(t, err)
	t.Cleanup(func() {
		if app.Store != nil {
			_ = app.Store.Close()
		}
	})

	srv := httptest.NewServer(hubhttp.NewRouter(app))
	t.Cleanup(srv.Close)

	proxyID := "proxy-integration-1"
	sourceKey := "fake|pid-1|deadbeef"
	hubc := proxy.NewHubClient(srv.URL)
	reg := proxy.RegisterRequest{
		ProxyInstanceID: proxyID,
		PID:             1,
		ClientSourceKey: sourceKey,
	}
	reg.ClientSource.ClientSourceKey = sourceKey
	reg.ClientSource.PID = 1
	reg.ClientSource.ProtocolVersion = "2025-03-26"
	reg.ClientSource.ClientName = "Fake"
	reg.ClientSource.ClientVersion = "0.0.1"
	reg.ClientSource.CapabilitiesJSON = "{}"
	require.NoError(t, hubc.Register(context.Background(), reg))

	ctx, cancel := context.WithCancel(context.Background())

	upR, upW := io.Pipe()
	downStdinR, downStdinW := io.Pipe()
	downStdoutR, downStdoutW := io.Pipe()
	outR, outW := io.Pipe()
	// Drain downstream stdin so the bridge doesn't block when forwarding.
	go func() { _, _ = io.Copy(io.Discard, downStdinR) }()

	observer := proxy.NewObserver(proxy.ObserverConfig{
		ProxyInstanceID: proxyID,
		ClientSourceKey: sourceKey,
		HubClient:       hubc,
	})
	bridge := proxy.NewBridge(proxy.BridgeConfig{
		UpstreamIn:  upR,
		UpstreamOut: outW,
		Downstream: proxy.DownstreamStreams{
			Stdin:  downStdinW,
			Stdout: downStdoutR,
		},
		OnFrame: observer.OnFrame,
	})
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = bridge.Run(ctx)
	}()

	outCh := make(chan string, 32)
	go func() {
		scanner := bufio.NewScanner(outR)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			outCh <- scanner.Text()
		}
	}()

	h := &endToEndHarness{
		t:             t,
		hubURL:        srv.URL,
		app:           app,
		srv:           srv,
		proxyID:       proxyID,
		clientSource:  sourceKey,
		ctx:           ctx,
		cancel:        cancel,
		upstreamR:     upR,
		upstreamW:     upW,
		downstreamR:   downStdoutR,
		downstreamW:   downStdoutW,
		bridgeDone:    done,
		upstreamOutCh: outCh,
	}
	t.Cleanup(func() {
		cancel()
		_ = upW.Close()
		_ = downStdoutW.Close()
		_ = downStdinW.Close()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
		}
	})
	return h
}

// emit writes a single JSON-RPC frame as if it came from the downstream
// codex server, so the observer persists and broadcasts it.
func (h *endToEndHarness) emit(frame string) {
	_, err := io.WriteString(h.downstreamW, frame+"\n")
	require.NoError(h.t, err)
}

func (h *endToEndHarness) WaitForStoredEvent(t *testing.T, sessionID, eventType string) storedEvent {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		events, err := h.app.Store.ListSessionEvents(context.Background(), sessionID, 100, "")
		require.NoError(t, err)
		for _, e := range events {
			if e.EventType == eventType {
				return storedEvent{SessionID: e.SessionID, EventType: e.EventType, EventID: e.EventID}
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("event %s/%s never persisted", sessionID, eventType)
	return storedEvent{}
}

type storedEvent struct {
	SessionID string
	EventType string
	EventID   string
}

// sseEvent is the parsed subset of a Server-Sent Events payload.
type sseEvent struct {
	ID        string
	EventType string
	SessionID string
	Raw       json.RawMessage
}

func (h *endToEndHarness) openSSE(lastEventID string) (<-chan sseEvent, func()) {
	req, err := http.NewRequestWithContext(h.ctx, http.MethodGet, h.hubURL+"/api/v1/stream", nil)
	require.NoError(h.t, err)
	if lastEventID != "" {
		req.Header.Set("Last-Event-ID", lastEventID)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(h.t, err)
	require.Equal(h.t, http.StatusOK, resp.StatusCode)

	ch := make(chan sseEvent, 32)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(ch)
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		var cur sseEvent
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				if cur.EventType != "" {
					ch <- cur
				}
				cur = sseEvent{}
				continue
			}
			switch {
			case strings.HasPrefix(line, "id: "):
				cur.ID = strings.TrimPrefix(line, "id: ")
			case strings.HasPrefix(line, "event: "):
				cur.EventType = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				cur.Raw = json.RawMessage(strings.TrimPrefix(line, "data: "))
				var envelope struct {
					SessionID string `json:"thread_id"`
				}
				_ = json.Unmarshal(cur.Raw, &envelope)
				cur.SessionID = envelope.SessionID
			}
		}
	}()
	return ch, func() {
		_ = resp.Body.Close()
		wg.Wait()
	}
}

func TestProxyKeepsForwardingWhenHubDrops(t *testing.T) {
	env := newEndToEndHarness(t)
	// Kill the hub: ingest posts will now fail but the bridge should keep
	// pumping traffic between upstream and downstream without wedging.
	env.srv.Close()

	env.emit(`{"jsonrpc":"2.0","id":2,"method":"ping"}`)

	deadline := time.After(3 * time.Second)
	for {
		select {
		case line, ok := <-env.upstreamOutCh:
			if !ok {
				t.Fatal("upstream output channel closed early")
			}
			if strings.Contains(line, `"id":2`) {
				return
			}
		case <-deadline:
			t.Fatal("bridge stopped forwarding after hub dropped")
		}
	}
}

func TestProxyPersistsCodexEventAndStreamsItOverSSE(t *testing.T) {
	env := newEndToEndHarness(t)
	// Open SSE before emitting so the event lands on a live subscriber too.
	ch, closer := env.openSSE("")
	defer closer()

	env.emit(`{"jsonrpc":"2.0","method":"codex/event","params":{"_meta":{"threadId":"thread-1","requestId":1},"id":"evt-1","msg":{"type":"session_configured","session_id":"thread-1","model":"gpt-5.4"}}}`)

	got := env.WaitForStoredEvent(t, "thread-1", "session_configured")
	require.Equal(t, "thread-1", got.SessionID)

	deadline := time.After(3 * time.Second)
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				t.Fatal("SSE stream closed early")
			}
			if ev.EventType == "session_configured" {
				require.Equal(t, "thread-1", ev.SessionID)
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for SSE session_configured")
		}
	}
}

