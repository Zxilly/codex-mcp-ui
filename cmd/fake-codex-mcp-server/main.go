package main

import (
	"fmt"
	"os"

	"github.com/codex/codex-mcp-ui/internal/testutil/fakecodex"
)

func main() {
	if err := fakecodex.Run(os.Stdin, os.Stdout, nil); err != nil {
		fmt.Fprintln(os.Stderr, "fake-codex-mcp-server:", err)
		os.Exit(1)
	}
}
