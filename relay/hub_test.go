package main

import (
	"testing"
	"time"
)

type fakeConn struct{}

func (f *fakeConn) Close(statusCode int, reason string) error { return nil }

func TestCreateRoomReturnsFourCharCode(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	client := NewClient("a1", hub, nil)

	code := hub.CreateRoom(client)
	if len(code) != 4 {
		t.Fatalf("expected 4-char code, got %d chars: %s", len(code), code)
	}
}

func TestJoinRoomNotifiesBothPeers(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	c1 := NewClient("a1", hub, nil)
	c2 := NewClient("b2", hub, nil)

	code := hub.CreateRoom(c1)
	if err := hub.JoinRoom(c2, code); err != nil {
		t.Fatalf("join room failed: %v", err)
	}

	// Drain messages from c1
	var gotPeerJoined bool
	drain:
	for {
		select {
		case msg := <-c1.send:
			if msg.Type == "peer_joined" && msg.PeerID == "b2" {
				gotPeerJoined = true
			}
		default:
			break drain
		}
	}
	if !gotPeerJoined {
		t.Fatal("c1 did not receive peer_joined for c2")
	}

	// Drain messages from c2
	gotPeerJoined = false
	drain2:
	for {
		select {
		case msg := <-c2.send:
			if msg.Type == "peer_joined" && msg.PeerID == "a1" {
				gotPeerJoined = true
			}
		default:
			break drain2
		}
	}
	if !gotPeerJoined {
		t.Fatal("c2 did not receive peer_joined for c1")
	}
}

func TestJoinInvalidRoomReturnsError(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	c := NewClient("a1", hub, nil)

	err := hub.JoinRoom(c, "ZZZZ")
	if err == nil {
		t.Fatal("expected error for invalid room code")
	}
	if err.Error() != "room not found" {
		t.Fatalf("expected 'room not found', got %q", err.Error())
	}
}

func TestJoinExpiredRoomReturnsError(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 1 * time.Millisecond})
	c1 := NewClient("a1", hub, nil)
	c2 := NewClient("b2", hub, nil)

	code := hub.CreateRoom(c1)
	time.Sleep(5 * time.Millisecond)

	err := hub.JoinRoom(c2, code)
	if err == nil {
		t.Fatal("expected error for expired room")
	}
	if err.Error() != "room expired" {
		t.Fatalf("expected 'room expired', got %q", err.Error())
	}
}

func TestClientDisconnectSendsPeerLeft(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	c1 := NewClient("a1", hub, nil)
	c2 := NewClient("b2", hub, nil)

	code := hub.CreateRoom(c1)
	hub.JoinRoom(c2, code)

	// Drain existing messages
	drainChan(c1.send)
	drainChan(c2.send)

	// Unregister c1
	hub.unregister(c1)

	// c2 should receive peer_left
	select {
	case msg := <-c2.send:
		if msg.Type != "peer_left" {
			t.Fatalf("expected peer_left, got %s", msg.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for peer_left")
	}
}

func drainChan(ch chan OutMessage) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}
