# Relay Deployment

The signaling relay is a standalone Go service in `relay/`. It only handles initial WebRTC pairing — no study data ever touches it.

## Build & Run Locally

```bash
cd relay
go run .
```

The server listens on `:8080` by default.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `ROOM_TTL_SECONDS` | `600` (10 min) | How long rooms stay alive |
| `SWEEP_INTERVAL_SECONDS` | `30` | How often to clean up expired rooms |

## Docker

```bash
cd relay
docker build -t studytoolbox-relay .
docker run -p 8080:8080 studytoolbox-relay
```

## GitHub Container Registry

On every tag push matching `v*`, GitHub Actions builds and pushes a multi-arch image:

```
ghcr.io/<owner>/studytoolbox-relay:<tag>
ghcr.io/<owner>/studytoolbox-relay:latest
```

## CORS

By default, the relay accepts WebSocket connections from any origin (`OriginPatterns: []string{"*"}`). Restrict this in production by changing `OriginPatterns` in `relay/handler.go`.

## Front-end Configuration

Point the Next.js app at your relay:

```bash
NEXT_PUBLIC_RELAY_URL=wss://relay.example.com/ws pnpm dev
```
