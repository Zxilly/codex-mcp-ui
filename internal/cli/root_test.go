package cli

import (
	"testing"

	"github.com/spf13/cobra"
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

func TestDefaultUIPortIs8787(t *testing.T) {
	cmd := NewRootCmd()
	port, err := cmd.PersistentFlags().GetInt("ui-port")
	require.NoError(t, err)
	require.Equal(t, 8787, port)
}

func TestUnknownFlagsDoNotCauseParseError(t *testing.T) {
	// Unknown flags like --sandbox must not cause a cobra flag-parse error.
	cmd := NewRootCmd()
	cmd.RunE = func(c *cobra.Command, args []string) error { return nil }
	cmd.SetArgs([]string{"--ui-port", "8787", "--sandbox", "workspace-write"})
	require.NoError(t, cmd.Execute())
}

func TestFilterPassthroughArgs(t *testing.T) {
	cases := []struct {
		input    []string
		expected []string
	}{
		{
			input:    []string{"--ui-port", "8787", "--sandbox", "workspace-write"},
			expected: []string{"--sandbox", "workspace-write"},
		},
		{
			input:    []string{"--ui-port=8787", "--sandbox", "workspace-write"},
			expected: []string{"--sandbox", "workspace-write"},
		},
		{
			input:    []string{"--sandbox", "workspace-write"},
			expected: []string{"--sandbox", "workspace-write"},
		},
		{
			input:    []string{"--ui-port", "9000"},
			expected: []string{},
		},
		{
			input:    []string{},
			expected: []string{},
		},
	}
	for _, tc := range cases {
		got := filterPassthroughArgs(tc.input)
		require.Equal(t, tc.expected, got)
	}
}
