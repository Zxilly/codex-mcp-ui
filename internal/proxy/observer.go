package proxy

import (
	"context"
	"log"
	"sync/atomic"
	"time"
)

// ObserverConfig wires an Observer to the hub. The observer watches every
// frame the bridge sees, normalizes it, and ships it to the hub's ingest
// endpoint.
type ObserverConfig struct {
	ProxyInstanceID string
	ClientSourceKey string
	HubClient       *HubClient
	// Logger is used for degraded/recovery notices. nil falls back to the
	// standard log package. Tests inject their own logger to avoid cross-
	// test bleeding through the global log output.
	Logger *log.Logger
}

// shipQueueSize bounds in-flight envelopes per observer; at burst rates
// beyond the hub's ingest throughput we drop rather than spawning unbounded
// goroutines. The bridge is unaffected — traffic still flows.
const shipQueueSize = 1024

type Observer struct {
	cfg      ObserverConfig
	degraded atomic.Bool
	queue    chan EventEnvelope
}

func NewObserver(cfg ObserverConfig) *Observer {
	o := &Observer{
		cfg:   cfg,
		queue: make(chan EventEnvelope, shipQueueSize),
	}
	go o.run()
	return o
}

// OnFrame implements the Bridge's observer callback. It never blocks
// traffic: if the ship queue is full the envelope is dropped and the
// observer enters the degraded state.
func (o *Observer) OnFrame(direction string, frame []byte) {
	env := Normalize(direction, frame)
	env.ProxyInstanceID = o.cfg.ProxyInstanceID
	env.ClientSourceKey = o.cfg.ClientSourceKey
	o.enqueue(env)
}

func (o *Observer) enqueue(env EventEnvelope) {
	select {
	case o.queue <- env:
	default:
		o.reportDegraded("ship queue full, dropping envelope")
	}
}

func (o *Observer) run() {
	for env := range o.queue {
		o.ship(env)
	}
}

func (o *Observer) ship(env EventEnvelope) {
	if o.cfg.HubClient == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := o.cfg.HubClient.IngestEvent(ctx, env); err != nil {
		o.reportDegraded("post to hub: %v", err)
		return
	}
	if o.degraded.CompareAndSwap(true, false) {
		o.logf("codex-mcp-ui: hub ingest recovered")
	}
}

// reportDegraded logs a warning once per degradation episode so the
// operator sees the hub is unreachable without spamming stderr when the
// hub stays down.
func (o *Observer) reportDegraded(format string, args ...any) {
	if o.degraded.CompareAndSwap(false, true) {
		o.logf("codex-mcp-ui: hub ingest degraded ("+format+"); proxy keeps forwarding", args...)
	}
}

func (o *Observer) logf(format string, args ...any) {
	if o.cfg.Logger != nil {
		o.cfg.Logger.Printf(format, args...)
		return
	}
	log.Printf(format, args...)
}
