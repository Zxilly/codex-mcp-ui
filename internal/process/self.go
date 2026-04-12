package process

import "os"

func selfPID() int { return os.Getpid() }
