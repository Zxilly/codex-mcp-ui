package cli

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRootCommandRegistersManagementCommands(t *testing.T) {
	cmd := NewRootCmd()
	names := []string{}
	for _, child := range cmd.Commands() {
		names = append(names, child.Name())
	}
	require.Contains(t, names, "server")
	require.Contains(t, names, "hub")
}

func TestProxyModeRequiresDashSeparatedDownstreamArgs(t *testing.T) {
	cmd := NewRootCmd()
	cmd.SetArgs([]string{"--ui-port", "8787"})
	err := cmd.Execute()
	require.ErrorContains(t, err, "expected downstream arguments after --")
}
