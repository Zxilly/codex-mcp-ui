package proxy

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
)

// InitializeFingerprint is the subset of an MCP `initialize` request used
// to derive a stable grouping identity for a client source.
type InitializeFingerprint struct {
	ProtocolVersion  string
	ClientName       string
	ClientVersion    string
	CapabilitiesJSON string
}

// DeriveClientSourceKey produces a human-readable, stable identifier for a
// client source. The upstream PID and MCP client name are surfaced directly
// so operators can recognise the key; the remaining fingerprint fields are
// folded into a short hash suffix to distinguish otherwise-identical
// entries.
func DeriveClientSourceKey(pid int, fp InitializeFingerprint) string {
	name := strings.TrimSpace(fp.ClientName)
	if name == "" {
		name = "unknown-client"
	}
	h := sha256.New()
	h.Write([]byte(fp.ProtocolVersion))
	h.Write([]byte{'|'})
	h.Write([]byte(fp.ClientName))
	h.Write([]byte{'|'})
	h.Write([]byte(fp.ClientVersion))
	h.Write([]byte{'|'})
	h.Write([]byte(fp.CapabilitiesJSON))
	short := hex.EncodeToString(h.Sum(nil))[:8]
	return fmt.Sprintf("%s|pid-%s|%s", name, strconv.Itoa(pid), short)
}
