package hub

import (
	"encoding/json"
	"sync"
)

// BrokerEvent is the transport-friendly view of a persisted envelope that
// the SSE layer relays to browser clients. Wire format is snake_case with
// an ISO-8601 timestamp to match the dashboard's TypeScript types.
type BrokerEvent struct {
	EventID         string          `json:"event_id"`
	ProxyInstanceID string          `json:"proxy_instance_id"`
	ClientSourceKey string          `json:"source_key,omitempty"`
	SessionID       string          `json:"thread_id,omitempty"`
	TurnID          string          `json:"turn_id,omitempty"`
	RequestID       string          `json:"request_id,omitempty"`
	Direction       string          `json:"direction"`
	Category        string          `json:"category"`
	EventType       string          `json:"event_type,omitempty"`
	CommandCallID   string          `json:"command_call_id,omitempty"`
	ToolCallID      string          `json:"tool_call_id,omitempty"`
	Timestamp       string          `json:"timestamp"`
	Payload         json.RawMessage `json:"payload"`
}

// Broker is an in-memory SSE fanout with a small ring buffer so reconnects
// can ask "what did I miss since event X?" without re-querying SQLite.
type Broker struct {
	mu      sync.RWMutex
	subs    map[chan BrokerEvent]struct{}
	ring    []BrokerEvent
	ringCap int
}

func NewBroker(ringCap int) *Broker {
	if ringCap <= 0 {
		ringCap = 256
	}
	return &Broker{
		subs:    make(map[chan BrokerEvent]struct{}),
		ringCap: ringCap,
	}
}

// Publish stores the event in the replay ring and notifies live subscribers.
// Slow subscribers are dropped rather than blocking the bridge.
func (b *Broker) Publish(ev BrokerEvent) {
	b.mu.Lock()
	b.ring = append(b.ring, ev)
	if len(b.ring) > b.ringCap {
		b.ring = b.ring[len(b.ring)-b.ringCap:]
	}
	subs := make([]chan BrokerEvent, 0, len(b.subs))
	for ch := range b.subs {
		subs = append(subs, ch)
	}
	b.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
			// Drop event on slow subscriber; the reconnect contract
			// lets them catch up via Last-Event-ID.
		}
	}
}

// Subscribe returns a channel plus the replay slice of events after
// afterEventID. Pass "" to skip replay.
func (b *Broker) Subscribe(afterEventID string) (chan BrokerEvent, []BrokerEvent, func()) {
	ch := make(chan BrokerEvent, 32)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	replay := make([]BrokerEvent, 0)
	if afterEventID != "" {
		found := false
		for _, ev := range b.ring {
			if found {
				replay = append(replay, ev)
				continue
			}
			if ev.EventID == afterEventID {
				found = true
			}
		}
	}
	b.mu.Unlock()
	return ch, replay, func() {
		b.mu.Lock()
		delete(b.subs, ch)
		b.mu.Unlock()
		close(ch)
	}
}
