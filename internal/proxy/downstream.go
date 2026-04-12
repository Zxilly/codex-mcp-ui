package proxy

import (
	"context"
	"io"
	"os/exec"
)

// DownstreamStreams is the set of stdio handles used by the bridge. In
// production these come from `exec.Cmd.StdinPipe` / `StdoutPipe`; tests
// can wire in in-memory pipes instead.
type DownstreamStreams struct {
	Stdin  io.WriteCloser
	Stdout io.ReadCloser
}

// BuildDownstreamCommand returns the argv slice used to spawn the real
// downstream `codex mcp-server` process (see docs/codex_mcp_interface.md in
// the codex repo — the clap subcommand is the kebab-case `mcp-server`, not
// two separate words). Forwarded args are appended verbatim.
func BuildDownstreamCommand(forwarded []string) []string {
	argv := []string{"codex", "mcp-server"}
	argv = append(argv, forwarded...)
	return argv
}

// LaunchDownstream spawns the downstream command (argv[0] with argv[1:])
// and returns the cmd plus its stdio handles. The caller owns the lifetime
// of cmd.
type LaunchedDownstream struct {
	Cmd     *exec.Cmd
	Streams DownstreamStreams
	Stderr  io.ReadCloser
}

func LaunchDownstream(ctx context.Context, argv []string) (*LaunchedDownstream, error) {
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return &LaunchedDownstream{
		Cmd:     cmd,
		Streams: DownstreamStreams{Stdin: stdin, Stdout: stdout},
		Stderr:  stderr,
	}, nil
}
