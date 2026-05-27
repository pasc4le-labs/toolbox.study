package main

import (
	"log"
	"net/http"

	"github.com/coder/websocket"
)

var clientCounter int64

func makeClientID() string {
	clientCounter++
	return string(rune('a'+int(clientCounter)%26)) + string(rune('0'+int(clientCounter)%10))
}

type WSHandler struct {
	hub *Hub
}

func NewWSHandler(hub *Hub) *WSHandler {
	return &WSHandler{hub: hub}
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}

	client := NewClient(makeClientID(), h.hub, conn)
	go client.writePump()
	client.readPump()
}
