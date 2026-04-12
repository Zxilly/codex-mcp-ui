// Package fakecodex provides a stripped-down stand-in for `codex mcp server`
// used by the proxy's integration tests. It reads newline-delimited JSON-RPC
// frames from stdin and emits canned responses/events on stdout.
package fakecodex

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Run reads JSON-RPC frames from in and writes responses to out. The
// optional scripted events are written after the initial `initialize` reply.
func Run(in io.Reader, out io.Writer, scripted []string) error {
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, `"method":"initialize"`) {
			if _, err := fmt.Fprintln(out, `{"jsonrpc":"2.0","id":1,"result":{"ok":true}}`); err != nil {
				return err
			}
			for _, ev := range scripted {
				if _, err := fmt.Fprintln(out, ev); err != nil {
					return err
				}
			}
			continue
		}
		var msg map[string]any
		if err := json.Unmarshal([]byte(line), &msg); err == nil {
			if id, ok := msg["id"]; ok {
				reply := map[string]any{"jsonrpc": "2.0", "id": id, "result": map[string]any{}}
				buf, _ := json.Marshal(reply)
				if _, err := fmt.Fprintln(out, string(buf)); err != nil {
					return err
				}
			}
		}
	}
	return scanner.Err()
}
