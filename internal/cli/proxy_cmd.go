package cli

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/process"
	"github.com/codex/codex-mcp-ui/internal/proxy"
)

// errMissingDownstreamArgs is returned when proxy mode is invoked without
// `--` followed by the downstream codex command.
var errMissingDownstreamArgs = errors.New("expected downstream arguments after --")

func runProxyCmd(cmd *cobra.Command, args []string) error {
	dashIdx := cmd.ArgsLenAtDash()
	if dashIdx < 0 || len(args) == 0 {
		return errMissingDownstreamArgs
	}
	downstream := args[dashIdx:]
	if len(downstream) == 0 {
		return errMissingDownstreamArgs
	}
	uiPort, _ := cmd.Root().PersistentFlags().GetInt("ui-port")
	if uiPort <= 0 {
		return fmt.Errorf("--ui-port is required")
	}

	ctx, cancel := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", uiPort)
	hubClient := proxy.NewHubClient(baseURL)

	if _, err := hubClient.Handshake(ctx); err != nil {
		if _, err := process.SpawnDetachedHub(uiPort); err != nil {
			return fmt.Errorf("spawn hub: %w", err)
		}
		if err := waitForHub(ctx, hubClient, 5*time.Second); err != nil {
			return fmt.Errorf("hub handshake after spawn: %w", err)
		}
	}

	meta := process.LookupParent(ctx)
	sourceKey := proxy.DeriveClientSourceKey(meta.PID, proxy.InitializeFingerprint{})
	proxyID := "proxy-" + randHex(8)

	_ = hubClient.Register(ctx, proxy.RegisterRequest{
		ProxyInstanceID: proxyID,
		PID:             os.Getpid(),
		ClientSourceKey: sourceKey,
		ClientSource: api.ClientSourceRegistration{
			ClientSourceKey: sourceKey,
			PID:             meta.PID,
			ClientName:      displayClientName(meta.ExecutablePath),
			ExecutablePath:  meta.ExecutablePath,
			CommandLine:     meta.CommandLine,
			CWD:             meta.CWD,
		},
	})

	go heartbeatLoop(ctx, hubClient, proxyID, 30*time.Second)

	argv := proxy.BuildDownstreamCommand(downstream)
	down, err := proxy.LaunchDownstream(ctx, argv)
	if err != nil {
		return fmt.Errorf("launch downstream: %w", err)
	}
	defer func() {
		_ = down.Streams.Stdin.Close()
		_ = down.Cmd.Wait()
	}()

	observer := proxy.NewObserver(proxy.ObserverConfig{
		ProxyInstanceID: proxyID,
		ClientSourceKey: sourceKey,
		HubClient:       hubClient,
	})
	bridge := proxy.NewBridge(proxy.BridgeConfig{
		UpstreamIn:  os.Stdin,
		UpstreamOut: os.Stdout,
		Downstream:  down.Streams,
		OnFrame:     observer.OnFrame,
	})
	go func() { _, _ = io.Copy(os.Stderr, down.Stderr) }()
	return bridge.Run(ctx)
}

func waitForHub(ctx context.Context, c *proxy.HubClient, deadline time.Duration) error {
	end := time.Now().Add(deadline)
	for time.Now().Before(end) {
		if _, err := c.Handshake(ctx); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
	return fmt.Errorf("hub did not respond within %s", deadline)
}

func heartbeatLoop(ctx context.Context, c *proxy.HubClient, proxyID string, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_ = c.Heartbeat(ctx, proxyID)
		}
	}
}

func displayClientName(execPath string) string {
	if execPath == "" {
		return "unknown-client"
	}
	return filepath.Base(execPath)
}

func randHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
