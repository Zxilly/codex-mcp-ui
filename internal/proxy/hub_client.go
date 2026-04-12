package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/codex/codex-mcp-ui/internal/hub/api"
	hubhttp "github.com/codex/codex-mcp-ui/internal/hub/http"
	"github.com/codex/codex-mcp-ui/internal/version"
)

// HubClient is the proxy-side view of the loopback hub. It validates the
// hub handshake, registers proxy instances, and ships heartbeats.
type HubClient struct {
	baseURL string
	http    *http.Client
}

func NewHubClient(baseURL string) *HubClient {
	return &HubClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *HubClient) Handshake(ctx context.Context) (*api.HandshakeResponse, error) {
	// Delegate to the shared validator so compatibility rules stay in one place.
	return hubhttp.ValidateHandshake(c.baseURL, version.AppVersion)
}

// RegisterRequest is the body of POST /api/v1/ingest/register.
type RegisterRequest struct {
	ProxyInstanceID string                       `json:"proxy_instance_id"`
	PID             int                          `json:"pid"`
	ClientSourceKey string                       `json:"source_key"`
	ClientSource    api.ClientSourceRegistration `json:"client_source"`
}

func (c *HubClient) Register(ctx context.Context, body RegisterRequest) error {
	return c.postJSON(ctx, "/api/v1/ingest/register", body)
}

func (c *HubClient) Heartbeat(ctx context.Context, proxyInstanceID string) error {
	return c.postJSON(ctx, "/api/v1/ingest/heartbeat", map[string]string{"proxy_instance_id": proxyInstanceID})
}

// IngestEvent posts a normalized envelope to the hub's ingest endpoint.
func (c *HubClient) IngestEvent(ctx context.Context, env EventEnvelope) error {
	return c.postJSON(ctx, "/api/v1/ingest/events", env)
}

func (c *HubClient) postJSON(ctx context.Context, path string, body any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("%s returned %d", path, resp.StatusCode)
	}
	return nil
}
