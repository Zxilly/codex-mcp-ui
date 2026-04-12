package process

import (
	"context"
	"strings"

	"github.com/shirou/gopsutil/v4/process"
)

// UpstreamMetadata captures the portable identity signals collected for the
// proxy's immediate parent (the MCP client that spawned us).
type UpstreamMetadata struct {
	PID            int
	ExecutablePath string
	CommandLine    string
	CWD            string
}

// LookupParent returns metadata about the proxy's parent process. Missing
// fields are left zero rather than returning an error so callers can still
// derive a source key on restricted systems.
func LookupParent(ctx context.Context) UpstreamMetadata {
	meta := UpstreamMetadata{}
	self, err := process.NewProcessWithContext(ctx, int32(selfPID()))
	if err != nil {
		return meta
	}
	parentPID, err := self.PpidWithContext(ctx)
	if err != nil || parentPID == 0 {
		return meta
	}
	meta.PID = int(parentPID)
	parent, err := process.NewProcessWithContext(ctx, parentPID)
	if err != nil {
		return meta
	}
	if exe, err := parent.ExeWithContext(ctx); err == nil {
		meta.ExecutablePath = exe
	}
	if parts, err := parent.CmdlineSliceWithContext(ctx); err == nil {
		meta.CommandLine = strings.Join(parts, " ")
	}
	if cwd, err := parent.CwdWithContext(ctx); err == nil {
		meta.CWD = cwd
	}
	return meta
}
