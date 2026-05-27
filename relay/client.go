package main

import (
	"context"
	"log"
	"sync"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// Client wraps a single WebSocket connection.
type Client struct {
	ID      string
	hub     *Hub
	room    *Room
	conn    *websocket.Conn
	send    chan OutMessage
	ctx     context.Context
	cancel  context.CancelFunc
	closeOnce sync.Once
}

func NewClient(id string, hub *Hub, conn *websocket.Conn) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	return &Client{
		ID:     id,
		hub:    hub,
		conn:   conn,
		send:   make(chan OutMessage, 16),
		ctx:    ctx,
		cancel: cancel,
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close(websocket.StatusNormalClosure, "")
	}()

	for {
		var msg InMessage
		err := wsjson.Read(c.ctx, c.conn, &msg)
		if err != nil {
			if websocket.CloseStatus(err) == websocket.StatusNormalClosure {
				return
			}
			log.Printf("client %s read error: %v", c.ID, err)
			return
		}
		c.hub.handleMessage(c, msg)
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close(websocket.StatusNormalClosure, "")
	}()

	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				c.conn.Close(websocket.StatusNormalClosure, "")
				return
			}
			if err := wsjson.Write(c.ctx, c.conn, msg); err != nil {
				log.Printf("client %s write error: %v", c.ID, err)
				return
			}
		case <-c.ctx.Done():
			return
		}
	}
}

func (c *Client) Send(msg OutMessage) {
	select {
	case c.send <- msg:
	default:
		// Channel full — drop message
	}
}

func (c *Client) Close() {
	c.closeOnce.Do(func() {
		c.cancel()
		close(c.send)
	})
}
