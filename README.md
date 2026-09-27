# VC Meet

A real-time video meeting app built with WebRTC and [Convex](https://convex.dev). Create or join rooms by ID, share your camera, mute/unmute, share your screen, record, and chat with other participants. The host admits people from a waiting room and can end the meeting for everyone.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Deployment (Vercel + Convex)](#deployment-vercel--convex): step-by-step in [DEPLOY.md](./DEPLOY.md)

---

## Features

| Feature | Description |
|--------|-------------|
| **Multi-user video calls** | Peer-to-peer video and audio via WebRTC; mesh topology (each participant connects to every other). |
| **Waiting room** | The first person to create a room is the host; everyone else waits until the host admits them. |
| **End meeting** | The host can end the meeting, which removes everyone and deletes the room. |
| **Mute / video off** | Toggle mic and camera; others see a placeholder with your initial when your camera is off. |
| **Screen sharing** | One active sharer per room; the shared screen becomes the main tile. |
| **Screen recording** | Local recording of the shared screen (or a new capture), downloaded as WebM. |
| **In-call chat** | Room-scoped chat; you see messages sent after you joined. |
| **Automatic rooms** | "Start a meeting" hands the host a free room number (1 to 999); guests join with that number or the `/room/<id>` link. |
| **Meeting cap** | At most 5 meetings run at once (`MAX_ACTIVE_ROOMS` in `convex/model.ts`). The landing page shows live availability. |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| **Realtime backend** | Convex (room state, signaling inbox, chat, presence) |
| **Media** | WebRTC (browser APIs), `getUserMedia`, `getDisplayMedia`, `MediaRecorder` |

---

## Architecture

- **Next.js** serves the UI (on Vercel, or `next dev` locally).
- **Convex** stores room state and relays signaling. Clients subscribe to live queries, so changes are pushed to them automatically.
- **Media** flows peer-to-peer between browsers; Convex never sees audio or video.

```
 Browser A ──mutations──►  Convex  ◄──mutations── Browser B
     ▲                    rooms, members,              ▲
     └──live queries────  pending, signals,  ─live queries┘
                          messages, presence
 Browser A ◄════════════ WebRTC media (P2P) ════════════► Browser B
```

### Client connection layer

`app/lib/roomConnection.ts` wraps a `ConvexClient` and exposes the same `emit(event, payload, ack)` / `on(event, handler)` interface the app used with Socket.IO, so `useWebRTC`, `useChat`, and the pages talk to it the same way. Each browser tab gets a random session id (the old `socket.id`).

| Client emits | Convex function |
|--------------|-----------------|
| `room-exists` | `rooms.exists` (query) |
| `create-random-room` | `rooms.createRandom`: picks and reserves a free room in one transaction |
| `join-room` | `rooms.join` |
| `admit-participant` | `rooms.admit` |
| `end-meeting` | `rooms.end` |
| `leave-room` | `rooms.leave` |
| `offer`, `answer`, `ice-candidate` | `signals.send` (batched every ~40 ms) |
| `chat-message` | `chat.send` |
| `screen-share`, `video-state` | `rooms.setScreenShare`, `rooms.setVideoState` |

Events the app listens for come from three subscriptions:

- **`rooms.state`**: the connection diffs room membership and emits `peers`, `peer-joined`, `peer-left`, `participants-update`, `pending-requests`, `screen-sharer`, `screen-share`, `peer-video-state`, `room-entry-approved`, and `room-entry-waiting`.
- **`signals.inbox`**: a per-session inbox for `offer`, `answer`, and `ice-candidate`, plus server events (`meeting-ended`, `room-entry-denied`, `room-entry-revoked`). Messages are deleted once the client acknowledges them.
- **`chat.list`**: emits `chat-message`.

### Presence (replacement for socket disconnect)

- While a tab is in a room, it sends `rooms.heartbeat` every 10 s.
- On `pagehide` the tab calls `navigator.sendBeacon` on the `/disconnect` HTTP action, so closing a tab frees its seat right away.
- A scheduled `rooms.sweep` runs every 15 s per active room and removes sessions with no heartbeat for 30 s (e.g. crashed tabs or lost network).

### WebRTC flow (one new peer)

1. B joins (or is admitted). B's `rooms.state` subscription emits `peers` and each existing peer A sees `peer-joined`.
2. A creates an offer and sends it to B's inbox; B answers into A's inbox; both exchange ICE candidates the same way.
3. Media then flows directly between A and B.

---

## Project structure

```
video-chat-app/
├── app/
│   ├── components/          # TopBar, BottomBar, VideoGrid, VideoTile, ChatPanel, ParticipantsPanel, ConfirmDialog
│   ├── hooks/
│   │   ├── useChat.ts       # messages, sendMessage
│   │   └── useWebRTC.ts     # media, peer connections, signaling, room entry
│   ├── icons/
│   ├── lib/
│   │   ├── roomConnection.ts # Convex-backed connection (emit/on)
│   │   ├── landingLaunch.ts
│   │   └── room.ts          # room id helpers
│   ├── room/[roomId]/page.tsx
│   ├── layout.tsx
│   └── page.tsx             # landing: join / create
├── convex/
│   ├── schema.ts            # rooms, members, pending, presence, signals, messages
│   ├── model.ts             # shared helpers (room cleanup, name checks, …)
│   ├── rooms.ts             # join/admit/end/leave, heartbeat, sweep, state query
│   ├── signals.ts           # signaling inbox
│   ├── chat.ts
│   └── http.ts              # POST /disconnect (tab-close beacon)
└── package.json
```

---

## Getting started

### Prerequisites

- Node.js 18+
- A free Convex account (optional for local development, see below)

### Run locally

Run these in two terminals:

```bash
npm install
npx convex dev   # first run: log in and create a project (writes .env.local)
```

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

`npx convex dev` keeps running, pushes changes in `convex/` on save, and regenerates `convex/_generated`. To try the app without an account, run `CONVEX_AGENT_MODE=anonymous npx convex dev`, which starts a local backend.

### Scripts

```bash
npm run dev      # Next.js dev server
npm run convex   # convex dev
npm run build    # Next.js production build
npm run start    # serve the production build
npm run lint
```

---

## Deployment (Vercel + Convex)

The whole app is Vercel plus Convex; there is no server of your own to keep running. See [DEPLOY.md](./DEPLOY.md). In short:

1. Create a production deploy key in the Convex dashboard.
2. On Vercel, set `CONVEX_DEPLOY_KEY` and change the build command to `npx convex deploy --cmd 'npm run build'`.

Each Vercel deploy then pushes the Convex functions and sets `NEXT_PUBLIC_CONVEX_URL` automatically.

---

## License

Private / unlicensed unless otherwise specified.
