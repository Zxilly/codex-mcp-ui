package cli

import (
	"context"
	"errors"
	"fmt"
	nethttp "net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/codex/codex-mcp-ui/internal/hub"
	hubhttp "github.com/codex/codex-mcp-ui/internal/hub/http"
)

func newHubCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:    "hub",
		Short:  "Hidden hub subcommands (used for self-spawn)",
		Hidden: true,
	}
	cmd.AddCommand(newHubServeCmd())
	return cmd
}

func newHubServeCmd() *cobra.Command {
	var dataDir string
	var idleTimeout time.Duration
	c := &cobra.Command{
		Use:    "serve",
		Short:  "Run the loopback hub server",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			port, _ := cmd.Root().PersistentFlags().GetInt("ui-port")
			if port <= 0 {
				return fmt.Errorf("--ui-port is required")
			}
			app, err := hub.NewApp(hub.Config{
				UIPort:      port,
				DataDir:     dataDir,
				IdleTimeout: idleTimeout,
			})
			if err != nil {
				return err
			}
			watchCtx, cancelWatch := context.WithCancel(cmd.Context())
			defer cancelWatch()
			app.StartIdleWatcher(watchCtx)

			srv := &nethttp.Server{
				Addr:    "127.0.0.1:" + strconv.Itoa(port),
				Handler: hubhttp.NewRouter(app),
			}
			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
			errCh := make(chan error, 1)
			go func() { errCh <- srv.ListenAndServe() }()

			select {
			case <-app.ShutdownCh:
			case <-sigCh:
			case err := <-errCh:
				if err != nil && !errors.Is(err, nethttp.ErrServerClosed) {
					return err
				}
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			return srv.Shutdown(ctx)
		},
	}
	c.Flags().StringVar(&dataDir, "data-dir", "", "hub data directory (default: user home/"+hub.DefaultDataDirName+")")
	c.Flags().DurationVar(&idleTimeout, "idle-timeout", 30*time.Minute, "shut down the hub after this duration with no API activity (zero disables)")
	return c
}
