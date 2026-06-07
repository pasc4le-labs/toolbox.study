package main

import (
	"sync"
	"time"
)

type RoomType string

const (
	RoomTypeExchange RoomType = "exchange"
	RoomTypeSync     RoomType = "sync"
)

// Room holds peers for signaling.
type Room struct {
	Code      string
	Type      RoomType
	Clients   map[string]*Client
	createdAt time.Time
	mu        sync.RWMutex
}

func NewRoom(code string) *Room {
	return &Room{
		Code:      code,
		Type:      RoomTypeExchange,
		Clients:   make(map[string]*Client),
		createdAt: time.Now(),
	}
}

func NewRoomWithType(code string, roomType RoomType) *Room {
	return &Room{
		Code:      code,
		Type:      roomType,
		Clients:   make(map[string]*Client),
		createdAt: time.Now(),
	}
}

func (r *Room) AddClient(c *Client) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.Clients) >= 2 {
		return false
	}
	r.Clients[c.ID] = c
	c.room = r
	return true
}

func (r *Room) RemoveClient(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Clients, c.ID)
	c.room = nil
}

func (r *Room) Other(c *Client) *Client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, client := range r.Clients {
		if id != c.ID {
			return client
		}
	}
	return nil
}

func (r *Room) IsExpired(ttl time.Duration) bool {
	return time.Since(r.createdAt) > ttl
}

func (r *Room) IsExpiredWithTTLs(exchangeTTL, syncTTL time.Duration) bool {
	ttl := exchangeTTL
	if r.Type == RoomTypeSync {
		ttl = syncTTL
	}
	return time.Since(r.createdAt) > ttl
}

func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Clients) == 0
}
