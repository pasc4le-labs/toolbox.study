package main

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"log"
	"math/big"
	"sync"
	"time"
)

var (
	errRoomNotFound = errors.New("room not found")
	errRoomExpired  = errors.New("room expired")
	errRoomFull     = errors.New("room is full")
)

const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// Hub manages all rooms and clients.
type Hub struct {
	rooms    map[string]*Room
	clients  map[string]*Client
	config   Config
	mu       sync.RWMutex
}

func NewHub(config Config) *Hub {
	if config.SweepInterval <= 0 {
		config.SweepInterval = 30 * time.Second
	}
	return &Hub{
		rooms:   make(map[string]*Room),
		clients: make(map[string]*Client),
		config:  config,
	}
}

func (h *Hub) generateCode() string {
	b := make([]byte, 4)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			// Fallback to time-based pseudo-random
			b[i] = codeAlphabet[time.Now().UnixNano()%int64(len(codeAlphabet))]
			continue
		}
		b[i] = codeAlphabet[n.Int64()]
	}
	return string(b)
}

func (h *Hub) CreateRoom(c *Client) string {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Generate unique code
	var code string
	for {
		code = h.generateCode()
		if _, exists := h.rooms[code]; !exists {
			break
		}
	}

	room := NewRoom(code)
	room.AddClient(c)
	h.rooms[code] = room
	h.clients[c.ID] = c

	return code
}

func (h *Hub) JoinRoom(c *Client, code string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[code]
	if !exists {
		return errRoomNotFound
	}
	if room.IsExpired(h.config.RoomTTL) {
		delete(h.rooms, code)
		return errRoomExpired
	}
	if !room.AddClient(c) {
		return errRoomFull
	}

	h.clients[c.ID] = c

	// Notify both peers
	for _, peer := range room.Clients {
		other := room.Other(peer)
		if other != nil {
			peer.Send(OutMessage{Type: "peer_joined", PeerID: other.ID})
		}
	}

	return nil
}

func (h *Hub) ForwardSignal(c *Client, data json.RawMessage) {
	h.mu.RLock()
	room := c.room
	h.mu.RUnlock()

	if room == nil {
		c.Send(OutMessage{Type: "error", Message: "not in a room"})
		return
	}

	other := room.Other(c)
	if other == nil {
		c.Send(OutMessage{Type: "error", Message: "peer not connected"})
		return
	}

	other.Send(OutMessage{Type: "signal", From: c.ID, Data: data})
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.clients, c.ID)

	if c.room != nil {
		room := c.room
		other := room.Other(c)
		room.RemoveClient(c)

		if other != nil {
			other.Send(OutMessage{Type: "peer_left"})
			// Don't close the other peer's connection; let it handle disconnection itself
		}

		delete(h.rooms, room.Code)
	}

	c.Close()
}

func (h *Hub) handleMessage(c *Client, msg InMessage) {
	switch msg.Type {
	case "create_room":
		code := h.CreateRoom(c)
		c.Send(OutMessage{Type: "room_created", Code: code})

	case "join_room":
		var code string
		if err := json.Unmarshal(msg.Code, &code); err != nil {
			c.Send(OutMessage{Type: "error", Message: "invalid room code"})
			return
		}
		if err := h.JoinRoom(c, code); err != nil {
			c.Send(OutMessage{Type: "error", Message: err.Error()})
		}

	case "signal":
		h.ForwardSignal(c, msg.Data)

	default:
		c.Send(OutMessage{Type: "error", Message: "unknown message type: " + msg.Type})
	}
}

func (h *Hub) RunSweep() {
	ticker := time.NewTicker(h.config.SweepInterval)
	defer ticker.Stop()

	for range ticker.C {
		h.mu.Lock()
		for code, room := range h.rooms {
			if room.IsExpired(h.config.RoomTTL) {
				for _, c := range room.Clients {
					c.Send(OutMessage{Type: "error", Message: "room expired"})
					c.Close()
					delete(h.clients, c.ID)
				}
				delete(h.rooms, code)
				log.Printf("swept expired room %s", code)
			}
		}
		h.mu.Unlock()
	}
}
