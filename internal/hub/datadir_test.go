package hub

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestResolveDataDir_DefaultUsesHome(t *testing.T) {
	base := t.TempDir()
	t.Setenv("HOME", base)
	t.Setenv("USERPROFILE", base)

	got, err := ResolveDataDir("")
	require.NoError(t, err)
	require.Equal(t, filepath.Join(base, DefaultDataDirName), got)
}

func TestResolveDataDir_ExplicitAbsolute(t *testing.T) {
	base := t.TempDir()
	got, err := ResolveDataDir(base)
	require.NoError(t, err)
	require.Equal(t, base, got)
}
