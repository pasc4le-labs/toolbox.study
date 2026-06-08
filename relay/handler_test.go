package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestTwoClientsCreateAndJoinRoom(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	go hub.RunSweep()

	wsHandler := NewWSHandler(hub)
	server := httptest.NewServer(wsHandler)
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Client 1 connects and creates room
	wsURL := strings.Replace(server.URL, "http", "ws", 1)
	c1, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c1: %v", err)
	}
	defer c1.Close(websocket.StatusNormalClosure, "")

	if err := wsjson.Write(ctx, c1, InMessage{Type: "create_room"}); err != nil {
		t.Fatalf("write create_room: %v", err)
	}

	var created OutMessage
	if err := wsjson.Read(ctx, c1, &created); err != nil {
		t.Fatalf("read room_created: %v", err)
	}
	if created.Type != "room_created" {
		t.Fatalf("expected room_created, got %s", created.Type)
	}
	if len(created.Code) != 4 {
		t.Fatalf("expected 4-char code, got %s", created.Code)
	}

	// Client 2 connects and joins
	c2, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c2: %v", err)
	}
	defer c2.Close(websocket.StatusNormalClosure, "")

	if err := wsjson.Write(ctx, c2, InMessage{Type: "join_room", Code: []byte(`"` + created.Code + `"`)}); err != nil {
		t.Fatalf("write join_room: %v", err)
	}

	// Both should receive peer_joined
	var msg1 OutMessage
	if err := wsjson.Read(ctx, c1, &msg1); err != nil {
		t.Fatalf("read c1 peer_joined: %v", err)
	}
	if msg1.Type != "peer_joined" {
		t.Fatalf("c1 expected peer_joined, got %s", msg1.Type)
	}

	var msg2 OutMessage
	if err := wsjson.Read(ctx, c2, &msg2); err != nil {
		t.Fatalf("read c2 peer_joined: %v", err)
	}
	if msg2.Type != "peer_joined" {
		t.Fatalf("c2 expected peer_joined, got %s", msg2.Type)
	}
}

func TestSignalForwarding(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	go hub.RunSweep()

	wsHandler := NewWSHandler(hub)
	server := httptest.NewServer(wsHandler)
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wsURL := strings.Replace(server.URL, "http", "ws", 1)
	c1, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c1: %v", err)
	}
	defer c1.Close(websocket.StatusNormalClosure, "")

	c2, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c2: %v", err)
	}
	defer c2.Close(websocket.StatusNormalClosure, "")

	// Create and join
	wsjson.Write(ctx, c1, InMessage{Type: "create_room"})
	var created OutMessage
	wsjson.Read(ctx, c1, &created)

	wsjson.Write(ctx, c2, InMessage{Type: "join_room", Code: []byte(`"` + created.Code + `"`)})
	var p1, p2 OutMessage
	wsjson.Read(ctx, c1, &p1)
	wsjson.Read(ctx, c2, &p2)

	// c1 sends signal
	signalData := []byte(`{"sdp":"fake-sdp"}`)
	wsjson.Write(ctx, c1, InMessage{Type: "signal", Data: signalData})

	var forwarded OutMessage
	if err := wsjson.Read(ctx, c2, &forwarded); err != nil {
		t.Fatalf("read forwarded signal: %v", err)
	}
	if forwarded.Type != "signal" {
		t.Fatalf("expected signal, got %s", forwarded.Type)
	}
	if forwarded.From == "" {
		t.Fatal("expected From field in forwarded signal")
	}
	if string(forwarded.Data) != string(signalData) {
		t.Fatalf("expected data %s, got %s", string(signalData), string(forwarded.Data))
	}
}

func TestInvalidMessageType(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	wsHandler := NewWSHandler(hub)
	server := httptest.NewServer(wsHandler)
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wsURL := strings.Replace(server.URL, "http", "ws", 1)
	c, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, c, InMessage{Type: "bogus"})

	var msg OutMessage
	if err := wsjson.Read(ctx, c, &msg); err != nil {
		t.Fatalf("read error: %v", err)
	}
	if msg.Type != "error" {
		t.Fatalf("expected error, got %s", msg.Type)
	}
}

func TestClientDisconnectTriggersPeerLeft(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute})
	go hub.RunSweep()

	wsHandler := NewWSHandler(hub)
	server := httptest.NewServer(wsHandler)
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wsURL := strings.Replace(server.URL, "http", "ws", 1)
	c1, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c1: %v", err)
	}

	c2, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c2: %v", err)
	}
	defer c2.Close(websocket.StatusNormalClosure, "")

	// Setup room
	wsjson.Write(ctx, c1, InMessage{Type: "create_room"})
	var created OutMessage
	wsjson.Read(ctx, c1, &created)
	wsjson.Write(ctx, c2, InMessage{Type: "join_room", Code: []byte(`"` + created.Code + `"`)})
	var p1, p2 OutMessage
	wsjson.Read(ctx, c1, &p1)
	wsjson.Read(ctx, c2, &p2)

	// c1 disconnects
	c1.Close(websocket.StatusNormalClosure, "")

	// c2 should receive peer_left
	var msg OutMessage
	if err := wsjson.Read(ctx, c2, &msg); err != nil {
		t.Fatalf("read peer_left: %v", err)
	}
	if msg.Type != "peer_left" {
		t.Fatalf("expected peer_left, got %s", msg.Type)
	}
}

func drainWS(ctx context.Context, c *websocket.Conn) {
	for {
		ctx2, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
		var msg OutMessage
		err := wsjson.Read(ctx2, c, &msg)
		cancel()
		if err != nil {
			return
		}
	}
}

func TestConfigDefaults(t *testing.T) {
	// Clear env vars that affect config
	t.Setenv("PORT", "")
	t.Setenv("ROOM_TTL_SECONDS", "")
	t.Setenv("SWEEP_INTERVAL_SECONDS", "")

	cfg := LoadConfig()
	if cfg.Port != "8080" {
		t.Fatalf("expected port 8080, got %s", cfg.Port)
	}
	if cfg.RoomTTL != 10*time.Minute {
		t.Fatalf("expected 10m TTL, got %v", cfg.RoomTTL)
	}
	if cfg.SweepInterval != 30*time.Second {
		t.Fatalf("expected 30s sweep, got %v", cfg.SweepInterval)
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("PORT", "9000")
	t.Setenv("ROOM_TTL_SECONDS", "60")
	t.Setenv("SWEEP_INTERVAL_SECONDS", "10")

	cfg := LoadConfig()
	if cfg.Port != "9000" {
		t.Fatalf("expected port 9000, got %s", cfg.Port)
	}
	if cfg.RoomTTL != 60*time.Second {
		t.Fatalf("expected 60s TTL, got %v", cfg.RoomTTL)
	}
	if cfg.SweepInterval != 10*time.Second {
		t.Fatalf("expected 10s sweep, got %v", cfg.SweepInterval)
	}
}

func TestSyncRoomCreateAndJoin(t *testing.T) {
	hub := NewHub(Config{RoomTTL: 10 * time.Minute, SyncRoomTTL: 24 * time.Hour})
	go hub.RunSweep()

	wsHandler := NewWSHandler(hub)
	server := httptest.NewServer(wsHandler)
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wsURL := strings.Replace(server.URL, "http", "ws", 1)

	c1, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c1: %v", err)
	}
	defer c1.Close(websocket.StatusNormalClosure, "")

	c2, _, err := websocket.Dial(ctx, wsURL+"/ws", nil)
	if err != nil {
		t.Fatalf("dial c2: %v", err)
	}
	defer c2.Close(websocket.StatusNormalClosure, "")

	roomCode := "a1b2c3d4e5f6g7h8"

	if err := wsjson.Write(ctx, c1, InMessage{Type: "create_room", Code: []byte(`"` + roomCode + `"`), RoomType: "sync"}); err != nil {
		t.Fatalf("write create_room: %v", err)
	}

	var created OutMessage
	if err := wsjson.Read(ctx, c1, &created); err != nil {
		t.Fatalf("read room_created: %v", err)
	}
	if created.Type != "room_created" {
		t.Fatalf("expected room_created, got %s", created.Type)
	}
	if created.Code != roomCode {
		t.Fatalf("expected code %s, got %s", roomCode, created.Code)
	}

	if err := wsjson.Write(ctx, c2, InMessage{Type: "create_room", Code: []byte(`"` + roomCode + `"`), RoomType: "sync"}); err != nil {
		t.Fatalf("write create_room: %v", err)
	}

	var roomJoined OutMessage
	if err := wsjson.Read(ctx, c2, &roomJoined); err != nil {
		t.Fatalf("read room_joined: %v", err)
	}
	if roomJoined.Type != "room_joined" {
		t.Fatalf("expected room_joined, got %s", roomJoined.Type)
	}
	if roomJoined.Code != roomCode {
		t.Fatalf("expected code %s, got %s", roomCode, roomJoined.Code)
	}

	var peerJoined OutMessage
	if err := wsjson.Read(ctx, c1, &peerJoined); err != nil {
		t.Fatalf("read peer_joined: %v", err)
	}
	if peerJoined.Type != "peer_joined" {
		t.Fatalf("expected peer_joined, got %s", peerJoined.Type)
	}
}
