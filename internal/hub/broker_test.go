package hub

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func event(id string) BrokerEvent {
	return BrokerEvent{EventID: id, EventType: "evt", Direction: "local", Category: "codex_event"}
}

func recv(t *testing.T, ch <-chan BrokerEvent, d time.Duration) (BrokerEvent, bool) {
	t.Helper()
	select {
	case ev, ok := <-ch:
		return ev, ok
	case <-time.After(d):
		return BrokerEvent{}, false
	}
}

func TestBrokerPublishFansOutToAllSubscribers(t *testing.T) {
	b := NewBroker(16)
	ch1, _, unsub1 := b.Subscribe("")
	defer unsub1()
	ch2, _, unsub2 := b.Subscribe("")
	defer unsub2()

	b.Publish(event("e1"))

	for _, ch := range []chan BrokerEvent{ch1, ch2} {
		ev, ok := recv(t, ch, time.Second)
		require.True(t, ok)
		require.Equal(t, "e1", ev.EventID)
	}
}

func TestBrokerSubscribeReplaysSinceCursor(t *testing.T) {
	b := NewBroker(16)
	b.Publish(event("e1"))
	b.Publish(event("e2"))
	b.Publish(event("e3"))

	_, replay, unsub := b.Subscribe("e1")
	defer unsub()
	ids := []string{}
	for _, ev := range replay {
		ids = append(ids, ev.EventID)
	}
	require.Equal(t, []string{"e2", "e3"}, ids)
}

func TestBrokerSubscribeWithEmptyCursorSkipsReplay(t *testing.T) {
	b := NewBroker(16)
	b.Publish(event("e1"))
	_, replay, unsub := b.Subscribe("")
	defer unsub()
	require.Empty(t, replay)
}

func TestBrokerRingEvictsOldestBeyondCapacity(t *testing.T) {
	b := NewBroker(3)
	for i, id := range []string{"e1", "e2", "e3", "e4", "e5"} {
		b.Publish(event(id))
		require.LessOrEqual(t, len(b.ring), 3, "iter %d", i)
	}
	// After 5 publishes at cap 3, e1/e2 should be evicted. Asking for
	// events since e3 should still return [e4, e5]; since evicted e1 returns
	// nothing (cursor not found = no replay).
	_, replay, unsub := b.Subscribe("e3")
	defer unsub()
	ids := []string{}
	for _, ev := range replay {
		ids = append(ids, ev.EventID)
	}
	require.Equal(t, []string{"e4", "e5"}, ids)

	_, replayMissing, unsub2 := b.Subscribe("e1")
	defer unsub2()
	require.Empty(t, replayMissing)
}

func TestBrokerUnsubscribeClosesChannel(t *testing.T) {
	b := NewBroker(4)
	ch, _, unsub := b.Subscribe("")
	unsub()
	_, ok := <-ch
	require.False(t, ok, "channel must be closed after unsub")
}

func TestBrokerDropsEventsOnSlowSubscriberInsteadOfBlocking(t *testing.T) {
	b := NewBroker(4)
	ch, _, unsub := b.Subscribe("")
	defer unsub()
	// Buffer is 32; push well beyond to force the drop branch.
	const n = 128
	done := make(chan struct{})
	go func() {
		for i := 0; i < n; i++ {
			b.Publish(event("x"))
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("publish blocked on slow subscriber")
	}
	// Drain what we can — count must be <= n (some were dropped).
	got := 0
	for {
		select {
		case <-ch:
			got++
		case <-time.After(50 * time.Millisecond):
			require.LessOrEqual(t, got, n)
			require.Positive(t, got, "some events must be delivered before drops began")
			return
		}
	}
}
