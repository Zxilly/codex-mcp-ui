package main

import (
	"os"

	"github.com/codex/codex-mcp-ui/internal/cli"
)

func main() {
	if err := cli.NewRootCmd().Execute(); err != nil {
		os.Exit(1)
	}
}
