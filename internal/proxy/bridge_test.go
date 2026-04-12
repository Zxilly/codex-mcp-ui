package proxy

import (
	"bufio"
	"context"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type bridgeHarness struct {
	upstreamIn  *io.PipeWriter
	upstreamOut *bufio.Scanner
	cancel      context.CancelFunc
	done        <-chan struct{}
}

// newBridgeHarness wires a Bridge between an in-memory upstream and a
// loopback downstream that echoes initialize requests with a canned result.
func newBridgeHarness(t *testing.T) *bridgeHarness {
	t.Helper()
	upR, upW := io.Pipe()
	outR, outW := io.Pipe()
	downR, downStdinW := io.Pipe()
	downStdoutR, downW := io.Pipe()

	go func() {
		scanner := bufio.NewScanner(downR)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, `"method":"initialize"`) {
				_, _ = downW.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"ok":true}}` + "\n"))
			}
		}
		_ = downW.Close()
	}()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	b := NewBridge(BridgeConfig{
		UpstreamIn:  upR,
		UpstreamOut: outW,
		Downstream: DownstreamStreams{
			Stdin:  downStdinW,
			Stdout: downStdoutR,
		},
	})
	var once sync.Once
	go func() {
		_ = b.Run(ctx)
		once.Do(func() { close(done) })
	}()

	t.Cleanup(func() {
		cancel()
		_ = upW.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
		}
	})

	return &bridgeHarness{
		upstreamIn:  upW,
		upstreamOut: bufio.NewScanner(outR),
		cancel:      cancel,
		done:        done,
	}
}

func (h *bridgeHarness) RoundTrip(frame string) string {
	_, _ = io.WriteString(h.upstreamIn, frame+"\n")
	if h.upstreamOut.Scan() {
		return h.upstreamOut.Text()
	}
	return ""
}

func TestBridgeForwardsInitializeAndResponse(t *testing.T) {
	env := newBridgeHarness(t)
	resp := env.RoundTrip(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}`)
	require.JSONEq(t, `{"jsonrpc":"2.0","id":1,"result":{"ok":true}}`, resp)
}

func TestBridgeLaunchesCodexAsMcpServerWithForwardedArgs(t *testing.T) {
	cmdline := BuildDownstreamCommand([]string{"--sandbox", "workspace-write"})
	require.Equal(t, []string{"codex", "mcp-server", "--sandbox", "workspace-write"}, cmdline)
}
