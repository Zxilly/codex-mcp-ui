package cli

import (
	"github.com/spf13/cobra"
)

func NewRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "codex-mcp-ui --ui-port <port> -- <codex args...>",
		Short:         "MCP MITM proxy with a local dashboard hub",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	cmd.PersistentFlags().Int("ui-port", 0, "loopback port for the local UI hub")
	cmd.AddCommand(newServerCmd())
	cmd.AddCommand(newHubCmd())
	cmd.RunE = runProxyCmd
	return cmd
}
