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

func TestCreateSyncRoom(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute, SyncRoomTTL: 24 * time.Hour})
	client := NewClient("a1", hub, nil)

	err := hub.CreateSyncRoom(client, "a1b2c3d4e5f6g7h8")
	if err != nil {
		t.Fatalf("create sync room failed: %v", err)
	}

	room, exists := hub.rooms["a1b2c3d4e5f6g7h8"]
	if !exists {
		t.Fatal("sync room not found in hub")
	}
	if room.Type != RoomTypeSync {
		t.Fatalf("expected RoomTypeSync, got %s", room.Type)
	}
}

func TestSyncRoomPersistsAfterDisconnect(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute, SyncRoomTTL: 24 * time.Hour})
	c1 := NewClient("a1", hub, nil)
	c2 := NewClient("b2", hub, nil)

	err := hub.CreateSyncRoom(c1, "persist-test-room")
	if err != nil {
		t.Fatalf("create sync room failed: %v", err)
	}

	hub.JoinRoom(c2, "persist-test-room")
	drainChan(c1.send)
	drainChan(c2.send)

	// Disconnect c1
	hub.unregister(c1)

	// Sync room should still exist
	if _, exists := hub.rooms["persist-test-room"]; !exists {
		t.Fatal("sync room was deleted after disconnect")
	}
}

func TestSyncRoomExpiredBySweep(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute, SyncRoomTTL: 1 * time.Millisecond})
	c1 := NewClient("a1", hub, nil)

	err := hub.CreateSyncRoom(c1, "sweep-test-room")
	if err != nil {
		t.Fatalf("create sync room failed: %v", err)
	}

	time.Sleep(5 * time.Millisecond)

	// Run sweep manually
	hub.mu.Lock()
	for code, room := range hub.rooms {
		if room.IsExpiredWithTTLs(hub.config.RoomTTL, hub.config.SyncRoomTTL) {
			for _, c := range room.Clients {
				c.Send(OutMessage{Type: "error", Message: "room expired"})
				c.Close()
				delete(hub.clients, c.ID)
			}
			delete(hub.rooms, code)
		}
	}
	hub.mu.Unlock()

	if _, exists := hub.rooms["sweep-test-room"]; exists {
		t.Fatal("sync room was not swept after TTL expired")
	}
}

func TestSyncRoomJoin(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute, SyncRoomTTL: 24 * time.Hour})
	c1 := NewClient("a1", hub, nil)
	c2 := NewClient("b2", hub, nil)

	err := hub.CreateSyncRoom(c1, "join-test-room")
	if err != nil {
		t.Fatalf("create sync room failed: %v", err)
	}

	drainChan(c1.send)

	if err := hub.JoinRoom(c2, "join-test-room"); err != nil {
		t.Fatalf("join sync room failed: %v", err)
	}

	// c1 should receive peer_joined
	var gotPeerJoined bool
drain:
	for {
		select {
		case msg := <-c1.send:
			if msg.Type == "peer_joined" {
				gotPeerJoined = true
			}
		default:
			break drain
		}
	}
	if !gotPeerJoined {
		t.Fatal("c1 did not receive peer_joined for c2")
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
