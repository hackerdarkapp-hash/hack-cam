# Remote Ops Center

A real-time smart home security camera system built with Node.js, Socket.io, and WebRTC. Turns any smartphone or browser tab into a live security camera that you can monitor from a central dashboard.

## Features

- **Live video streaming** via WebRTC — peer-to-peer, low latency
- **Multi-node support** — connect unlimited camera devices simultaneously
- **Remote camera switching** — flip between front and rear camera from the dashboard
- **Silent auto-handshake** — camera devices connect and stream automatically
- **Session reset** — terminate any camera session remotely
- **PWA** — installable on iOS and Android as a standalone app
- **Keep-alive** — built-in self-ping prevents the server from sleeping
- **Wake Lock** — camera devices keep their screen alive while streaming

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Package manager | pnpm (workspaces) |
| Backend | Express 5 + Socket.io 4 |
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 |
| Real-time | WebRTC (STUN via Google) |
| API contract | OpenAPI 3.1 → Orval codegen |
| Validation | Zod |
| PWA | vite-plugin-pwa + Workbox |

---

## Project Structure

```
remote-ops-center/
├── artifacts/
│   ├── api-server/          # Express + Socket.io signaling server
│   │   └── src/
│   │       ├── app.ts
│   │       ├── index.ts
│   │       ├── lib/
│   │       │   ├── signaling.ts   # WebRTC relay + node registry
│   │       │   ├── keepalive.ts   # Self-ping keep-alive
│   │       │   └── logger.ts
│   │       └── routes/
│   │           ├── health.ts
│   │           └── nodes.ts       # /nodes /sessions /stats endpoints
│   └── remote-support/      # React PWA frontend
│       └── src/
│           ├── pages/
│           │   ├── expert.tsx     # Expert dashboard (monitor + control)
│           │   └── node.tsx       # Camera device (Zen Mode UI)
│           └── lib/
│               └── socket.ts      # Socket.io singleton client
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 contract
│   ├── api-zod/             # Generated Zod schemas (server validation)
│   ├── api-client-react/    # Generated React Query hooks (frontend)
│   └── db/                  # Drizzle ORM setup (unused — in-memory only)
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## Quick Start

### Prerequisites

- Node.js 20 or later
- pnpm 9 or later (`npm install -g pnpm`)

### Install

```bash
git clone https://github.com/YOUR_USERNAME/remote-ops-center.git
cd remote-ops-center
pnpm install
```

### Run codegen (required after fresh clone)

```bash
pnpm --filter @workspace/api-spec run codegen
```

### Development

Open two terminals:

```bash
# Terminal 1 — API + signaling server (port 8080)
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev

# Terminal 2 — React frontend (port 3000)
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/remote-support run dev
```

Then open `http://localhost:3000`.

### Production build

```bash
pnpm run build
```

---

## How to Use

| Page | URL | Role |
|---|---|---|
| Landing | `/` | Choose Expert or Camera mode |
| Expert Dashboard | `/expert` | Monitor all cameras, request streams, switch cameras |
| Camera Device | `/node` | Open on any smartphone to use it as a security camera |

**Setting up a camera:**
1. Open `/node` on a smartphone and grant camera + microphone permission.
2. The device registers automatically — no button required.
3. Open `/expert` on your monitoring device.
4. Click any node in the list to start the live stream.

**Installing as a mobile app (PWA):**
- **Android / Chrome:** Open the URL → three-dot menu → *Add to home screen*
- **iPhone / Safari:** Open the URL → Share button → *Add to home screen*

---

## Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `node:register` | Node → Server | Register device on connect |
| `nodes:updated` | Server → All | Broadcast updated node list |
| `expert:request-stream` | Expert → Server → Node | Request camera stream |
| `webrtc:offer` | Node → Server → Expert | SDP offer relay |
| `webrtc:answer` | Expert → Server → Node | SDP answer relay |
| `webrtc:ice-candidate` | Both → Server → Both | ICE candidate relay |
| `camera:switch` | Expert → Server → Node | Switch front/rear camera |
| `session:reset` | Expert → Server → Node | Terminate session |

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `PORT` | API server | HTTP port (default: 8080) |
| `PORT` | Frontend | Vite dev server port |
| `BASE_PATH` | Frontend | Base URL path (default: `/`) |
| `NODE_ENV` | API server | `development` or `production` |

---

## License

MIT
