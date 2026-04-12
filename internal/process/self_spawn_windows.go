//go:build windows

package process

import (
	"os/exec"
	"syscall"
)

// configureDetached arranges for the child process to survive past the
// parent's exit on Windows by creating a new process group and detaching
// from the console.
func configureDetached(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x00000008 | 0x00000200, // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
	}
}
