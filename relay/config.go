package main

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port          string
	RoomTTL       time.Duration
	SweepInterval time.Duration
}

func LoadConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	roomTTL := 10 * time.Minute
	if v := os.Getenv("ROOM_TTL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			roomTTL = time.Duration(n) * time.Second
		}
	}

	sweepInterval := 30 * time.Second
	if v := os.Getenv("SWEEP_INTERVAL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			sweepInterval = time.Duration(n) * time.Second
		}
	}

	return Config{
		Port:          port,
		RoomTTL:       roomTTL,
		SweepInterval: sweepInterval,
	}
}
