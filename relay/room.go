package main

import (
	"sync"
	"time"
)

// Room holds exactly two peers for signaling.
type Room struct {
	Code      string
	Clients   map[string]*Client
	createdAt time.Time
	mu        sync.RWMutex
}

func NewRoom(code string) *Room {
	return &Room{
		Code:      code,
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

func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Clients) == 0
}
