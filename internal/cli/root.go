package cli

import (
	"github.com/spf13/cobra"
)

const defaultUIPort = 8787

func NewRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                   "codex-mcp-ui [--ui-port <port>] [codex args...]",
		Short:                 "MCP MITM proxy with a local dashboard hub",
		SilenceUsage:          true,
		SilenceErrors:         true,
		FParseErrWhitelist:    cobra.FParseErrWhitelist{UnknownFlags: true},
	}
	cmd.PersistentFlags().Int("ui-port", defaultUIPort, "loopback port for the local UI hub")
	cmd.AddCommand(newServerCmd())
	cmd.AddCommand(newHubCmd())
	cmd.RunE = runProxyCmd
	return cmd
}
