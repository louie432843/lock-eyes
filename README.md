# Lock Eyes

Share glances on any video call via a private 1:1 video side channel.

![Jim Halpert breaking the fourth wall](docs/jim-camera-stare.jpg)

*The exact feeling Lock Eyes is going for.*

## What This Does

Lock Eyes creates a private video connection between you and one other person on a video call. You each see the other's face in a small always-on-top window via your secondary camera. You can turn off your Zoom/Teams/Meet camera and be invisible to everyone — but your person still sees you. Either of you can kill it instantly.

**Not a Zoom app. A glance app. Use it on any call.**

## Features

- **Private 1:1 video** — see your partner's face via secondary camera, independent of Zoom
- **Streaming chat** — ephemeral messages that fade after 8 seconds. No history stored
- **Tic-tac-toe** — play a quick game with your partner during boring meetings
- **Hide self** — toggle your own camera preview on/off
- **Kill switch** — either party can kill the connection instantly, no explanation needed
- **Screenshot protection** — reaction window has content protection enabled
- **Chat accumulation** — if the window is unfocused, messages pile up and expire when you return

## How to Use

1. Get on a Zoom call (or Teams, Meet, whatever) with your friend
2. Both open Lock Eyes
3. One clicks "Create Session" — share the 4-letter code
4. Other types the code, clicks "Join" — first person clicks "Accept"
5. Both pick their secondary camera
6. You're live — share glances when someone says something wild

**To kill it:** Click the KILL button. Instant. Both sides go dark.

## How to Run (Development)

```bash
# Install dependencies
npm install

# Run in dev mode (Vite + Electron auto-starts)
npm run electron:dev

# Build for production
npm run build

# Run in production mode (without dev server)
LOCK_EYES_PROD=1 npx electron . --no-sandbox

# Build installers for all platforms
npm run build:all

# Or build for a single platform:
npm run package:mac    # macOS
npm run package:win    # Windows .exe
npm run package:linux  # Linux .AppImage
```

## How to Test with a Friend

1. Build installers: `npm run build:all`
2. Send the appropriate installer to your friend
3. Both install and open Lock Eyes
4. Both pick your secondary camera (USB webcam, etc.)
5. One creates a session, shares the code
6. Other joins with the code
7. Host clicks Accept when the handshake request appears
8. You're live — share glances

## What You Need

- Two computers (yours + your friend's)
- Two secondary cameras (USB webcams, or your phone as a camera)
- Two monitors (or at least one person with dual monitors — the reaction window needs somewhere to live)
- A video call platform (Zoom, Teams, Meet — doesn't matter, Lock Eyes doesn't interact with it)
- **No server to run.** PeerJS public broker handles signaling.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              PeerJS Public Broker (free)              │
│           Handles signaling only (~2 seconds)        │
│            No server for you to run or deploy         │
└──────────────────┬──────────────────────────────────┘
                   │ PeerJS signaling (SDP + ICE, automatic)
          ┌────────┴────────┐
          │                 │
   ┌──────▼──────┐   ┌──────▼──────┐
   │  Person A   │   │  Person B   │
   │  Electron   │   │  Electron   │
   │  App        │◄──┼──WebRTC P2P─┼─►│  App        │
   │             │   │             │
   │ Cam 1: Zoom │   │ Cam 1: Zoom │
   │ Cam 2: Lock │   │ Cam 2: Lock │
   │    Eyes     │   │    Eyes     │
   └─────────────┘   └─────────────┘
```

### Tech Stack

- **Electron** — cross-platform desktop app with always-on-top window, content protection, multi-display
- **React + Vite** — UI with dark theme and amber accent
- **PeerJS** — free public signaling broker, no server to run
- **WebRTC** — P2P encrypted video, sub-500ms latency

### Project Structure

```
lock-eyes/
├── package.json          # Dependencies, scripts, electron-builder config
├── vite.config.ts        # Vite + Electron build config
├── tsconfig.json         # TypeScript config
├── index.html            # Vite entry point
├── scripts/
│   └── build-all.sh      # Build installers for all 3 platforms
├── electron/
│   ├── main.ts           # Electron main process — window management, reaction window, permissions, IPC
│   ├── preload.ts        # Secure bridge — exposes window.electronAPI to renderer
│   └── reaction-preload.ts # Preload for the reaction window
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Main UI — session creation/joining, camera picker, live view, chat, kill switch
│   ├── Handshake.tsx     # Accept/decline modal for incoming "lock eyes" requests
│   ├── TicTacToe.tsx     # Tic-tac-toe game playable over the data channel
│   ├── peer.ts           # LockEyesPeer class — PeerJS connection lifecycle, chat, game moves
│   └── styles.css        # Dark theme with amber accent, pulse animations, status indicators
├── dist/                 # Built frontend (Vite output)
├── dist-electron/        # Built Electron main/preload (Vite output)
└── release/              # Packaged installers (electron-builder output)
```

### Connection Flow

1. **Host** clicks "Create Session" → generates 4-char code → registers as `lockeyes-<CODE>` on PeerJS broker
2. **Guest** enters code, clicks "Join" → connects to `lockeyes-<CODE>` via PeerJS data connection → sends `{type: 'request', name}`
3. **Host** receives request → sees "Katherine wants to lock eyes. Accept?" → clicks Accept
4. **Host** sends `{type: 'accept'}` → initiates `peer.call(remotePeerId, localStream)` with secondary camera
5. **Guest** receives call → answers with their local stream → both sides have remote video
6. **Reaction window** auto-opens showing partner's face
7. Either side can kill: closes PeerJS peer, stops media connection, closes reaction window

### Key Design Decisions

- **PeerJS runs in the renderer**, not the main process — `getUserMedia` only works in the renderer, and PeerJS needs the MediaStream directly
- **No custom signaling server** — PeerJS public broker (`0.peerjs.com`) handles matchmaking for free
- **Camera independence** — the side channel uses a separate camera and separate `MediaStream`, completely independent of Zoom's camera toggle
- **Content protection** — the reaction window uses `setContentProtection(true)` to block screenshots and screen recording
- **`lockeyes-` prefix** on all PeerJS peer IDs prevents collision with other PeerJS users
- **Ambiguous characters excluded** from session codes (no O/0/I/1/L)
- **Ephemeral chat** — messages stream in and fade after 8 seconds. No history is stored anywhere
- **Tic-tac-toe over data channel** — moves sync via the PeerJS data connection, no server needed

## Privacy & Safety

- **Mutual opt-in:** Both parties must accept before video flows
- **Kill switch:** Either party can sever instantly, no explanation needed
- **Camera independence:** Your Zoom camera state doesn't affect Lock Eyes
- **Screenshot protection:** Reaction window has content protection enabled
- **Status indicator:** Always know when you're being seen (green dot = LIVE)
- **No recording, no audio** — video only, ephemeral chat
- **Chat messages are not stored** — they fade after 8 seconds and are gone forever

## Troubleshooting

| Problem | Solution |
|---|---|
| "No session found for code X" | Host hasn't created a session yet, or code was mistyped |
| "Code in use" | Another session is using that code — app auto-generates a new one |
| Video doesn't connect | Check firewall/NAT. PeerJS uses Google STUN by default. May need TURN server for restrictive networks. |
| Camera not listed | Grant camera permission in OS settings. Some cameras need to be plugged in before app launch. |
| Reaction window doesn't appear | Ensure you have a second display, or drag the main window to see it |
| Black video for both parties | Ensure both users have selected a camera before creating/joining the session |
| Chat messages disappear too fast | Messages expire after 8 seconds. If the window is unfocused, they accumulate until you return |

---

*Built: July 9, 2026*
*Version: 0.1.0*