package main

import "encoding/json"

// Inbound messages from clients.
type InMessage struct {
	Type string          `json:"type"`
	Code json.RawMessage `json:"code,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

// Outbound messages to clients.
type OutMessage struct {
	Type    string          `json:"type"`
	Code    string          `json:"code,omitempty"`
	PeerID  string          `json:"peer_id,omitempty"`
	From    string          `json:"from,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
	Message string          `json:"message,omitempty"`
}
