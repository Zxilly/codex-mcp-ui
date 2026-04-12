package cli

import (
	"encoding/json"
	"fmt"
	nethttp "net/http"
	"strconv"
	"time"

	"github.com/spf13/cobra"

	"github.com/codex/codex-mcp-ui/internal/hub/api"
	hubhttp "github.com/codex/codex-mcp-ui/internal/hub/http"
	"github.com/codex/codex-mcp-ui/internal/version"
)

func hubhttpValidate(base, expected string) (*api.HandshakeResponse, error) {
	return hubhttp.ValidateHandshake(base, expected)
}

func newServerCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "server",
		Short: "Manage the local codex-mcp-ui hub",
	}
	cmd.AddCommand(newServerStatusCmd())
	cmd.AddCommand(newServerStopCmd())
	return cmd
}

func hubBaseURL(cmd *cobra.Command) (string, error) {
	port, _ := cmd.Root().PersistentFlags().GetInt("ui-port")
	if port <= 0 {
		return "", fmt.Errorf("--ui-port is required")
	}
	return "http://127.0.0.1:" + strconv.Itoa(port), nil
}

func newServerStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Print hub status",
		RunE: func(cmd *cobra.Command, args []string) error {
			base, err := hubBaseURL(cmd)
			if err != nil {
				return err
			}
			if _, err := hubhttpValidate(base, version.AppVersion); err != nil {
				return fmt.Errorf("hub not reachable or incompatible: %w", err)
			}
			client := &nethttp.Client{Timeout: 3 * time.Second}
			resp, err := client.Get(base + "/api/v1/status")
			if err != nil {
				return err
			}
			defer resp.Body.Close()
			var status api.StatusResponse
			if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
				return err
			}
			out, _ := json.MarshalIndent(status, "", "  ")
			fmt.Fprintln(cmd.OutOrStdout(), string(out))
			return nil
		},
	}
}

func newServerStopCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "stop",
		Short: "Ask the hub to shut down",
		RunE: func(cmd *cobra.Command, args []string) error {
			base, err := hubBaseURL(cmd)
			if err != nil {
				return err
			}
			if _, err := hubhttpValidate(base, version.AppVersion); err != nil {
				return fmt.Errorf("hub not reachable or incompatible: %w", err)
			}
			client := &nethttp.Client{Timeout: 3 * time.Second}
			resp, err := client.Post(base+"/api/v1/admin/shutdown", "application/json", nil)
			if err != nil {
				return err
			}
			defer resp.Body.Close()
			if resp.StatusCode != nethttp.StatusOK {
				return fmt.Errorf("shutdown returned status %d", resp.StatusCode)
			}
			fmt.Fprintln(cmd.OutOrStdout(), "hub stopping")
			return nil
		},
	}
}
