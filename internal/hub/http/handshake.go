package http

import (
	"encoding/json"
	"fmt"
	nethttp "net/http"
	"strconv"
	"strings"
	"time"

	"github.com/codex/codex-mcp-ui/internal/hub"
	"github.com/codex/codex-mcp-ui/internal/hub/api"
	"github.com/codex/codex-mcp-ui/internal/version"
)

func handshakeHandler(app *hub.App) nethttp.HandlerFunc {
	return func(w nethttp.ResponseWriter, r *nethttp.Request) {
		writeJSON(w, nethttp.StatusOK, app.Handshake())
	}
}

func writeJSON(w nethttp.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// ValidateHandshake calls GET /api/v1/handshake on the given base URL and
// returns the response if the hub is compatible with expectedAppVersion.
// Compatibility rules match the spec: service must match, protocol version
// must match exactly, required capabilities must be present, and app
// version mismatch is only allowed across patch/minor versions.
func ValidateHandshake(baseURL, expectedAppVersion string) (*api.HandshakeResponse, error) {
	client := &nethttp.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(strings.TrimRight(baseURL, "/") + "/api/v1/handshake")
	if err != nil {
		return nil, fmt.Errorf("handshake request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != nethttp.StatusOK {
		return nil, fmt.Errorf("handshake returned status %d", resp.StatusCode)
	}
	var hs api.HandshakeResponse
	if err := json.NewDecoder(resp.Body).Decode(&hs); err != nil {
		return nil, fmt.Errorf("handshake decode failed: %w", err)
	}
	if hs.Service != version.ServiceName {
		return nil, fmt.Errorf("incompatible service %q", hs.Service)
	}
	if hs.ProtocolVersion != version.ProtocolVersion {
		return nil, fmt.Errorf("incompatible protocol version %q", hs.ProtocolVersion)
	}
	for _, cap := range api.RequiredCapabilities {
		if !containsString(hs.Capabilities, cap) {
			return nil, fmt.Errorf("missing required capability %q", cap)
		}
	}
	if hs.AppVersion != expectedAppVersion {
		if !sameMajor(hs.AppVersion, expectedAppVersion) {
			return nil, fmt.Errorf("incompatible major version: hub=%s expected=%s", hs.AppVersion, expectedAppVersion)
		}
	}
	return &hs, nil
}

func containsString(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

func sameMajor(a, b string) bool {
	am, aok := majorOf(a)
	bm, bok := majorOf(b)
	if !aok || !bok {
		return false
	}
	return am == bm
}

func majorOf(semver string) (int, bool) {
	s := strings.TrimPrefix(semver, "v")
	dot := strings.IndexByte(s, '.')
	if dot < 0 {
		return 0, false
	}
	n, err := strconv.Atoi(s[:dot])
	if err != nil {
		return 0, false
	}
	return n, true
}
