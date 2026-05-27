# Exchange Center

The Exchange Center lets you share cards, bundles, and exams directly with other StudyToolbox users — peer-to-peer, with no data passing through any server.

## How it works

1. **Sender** opens Exchange Center → clicks **Offer Items** → selects cards/bundles/exams → clicks **Create Room**.
2. A short 4-character room code appears (e.g. `A3XK`). Share this code with your peer.
3. **Receiver** opens Exchange Center → clicks **Receive Items** → enters the room code → clicks **Connect**.
4. The two browsers establish a direct WebRTC data channel. The relay server is only used for the initial handshake.
5. The receiver sees a list of available items and picks which ones to import.
6. Selected items are transferred directly between browsers and saved into the receiver's local database.

## Security & Privacy

- **All data stays local.** Cards, bundles, and exams are transferred directly between browsers via WebRTC.
- The relay server only forwards tiny signaling messages (SDP offers/answers). It never sees your study data.
- Room codes expire after 10 minutes if unused.

## Requirements

- Both peers must have the relay server running (default: `ws://localhost:8080/ws`).
- Configure `NEXT_PUBLIC_RELAY_URL` to point to your relay instance.
