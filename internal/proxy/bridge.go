package proxy

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"sync"
)

// BridgeConfig wires a MITM bridge between an upstream MCP client (usually
// stdin/stdout of this process) and a downstream `codex mcp server`
// process.
type BridgeConfig struct {
	UpstreamIn  io.Reader
	UpstreamOut io.Writer
	Downstream  DownstreamStreams
	// OnFrame, if set, is called for every JSON-RPC frame observed in
	// either direction. The bridge forwards even if this callback
	// errors, so observation never blocks traffic.
	OnFrame func(direction string, frame []byte)
}

type Bridge struct {
	cfg BridgeConfig
}

func NewBridge(cfg BridgeConfig) *Bridge {
	return &Bridge{cfg: cfg}
}

// Run copies frames in both directions until either end closes or ctx is
// cancelled. It returns the first error encountered or nil on clean EOF.
func (b *Bridge) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	errCh := make(chan error, 2)

	wg.Add(2)
	go func() {
		defer wg.Done()
		errCh <- b.pump(ctx, "upstream", b.cfg.UpstreamIn, b.cfg.Downstream.Stdin)
	}()
	go func() {
		defer wg.Done()
		errCh <- b.pump(ctx, "downstream", b.cfg.Downstream.Stdout, b.cfg.UpstreamOut)
	}()

	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil && err != io.EOF && err != context.Canceled {
			return err
		}
	}
	return nil
}

func (b *Bridge) pump(ctx context.Context, dir string, in io.Reader, out io.Writer) error {
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		frame := append([]byte(nil), scanner.Bytes()...)
		if b.cfg.OnFrame != nil {
			b.cfg.OnFrame(dir, frame)
		}
		if _, err := out.Write(append(frame, '\n')); err != nil {
			return fmt.Errorf("%s write: %w", dir, err)
		}
	}
	return scanner.Err()
}
