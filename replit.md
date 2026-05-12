# Remote Ops Center

A real-time remote technical support tool that lets experts remotely access and control a field node's camera feed using WebRTC, Socket.io, and a signaling server.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Socket.io signaling server (port 8080)
- `pnpm --filter @workspace/remote-support run dev` — run the React frontend (port 23439)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io 4 (signaling server)
- DB: No database — all state is in-memory (connected nodes, active sessions)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, Wouter router, TanStack Query, socket.io-client, Tailwind CSS

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (nodes, sessions, stats endpoints)
- `artifacts/api-server/src/lib/signaling.ts` — Socket.io signaling server (WebRTC relay, node registry)
- `artifacts/api-server/src/routes/nodes.ts` — REST routes for /nodes, /sessions, /stats
- `artifacts/remote-support/src/pages/expert.tsx` — Expert Dashboard with WebRTC viewer
- `artifacts/remote-support/src/pages/node.tsx` — Node client (passive, receives commands)
- `artifacts/remote-support/src/lib/socket.ts` — Socket.io client singleton

## Architecture decisions

- **In-memory node registry**: Connected nodes and sessions are stored in memory on the signaling server. No DB needed — nodes re-register on reconnect.
- **Socket.io as signaling relay**: The server never participates in WebRTC — it only relays SDP offers/answers and ICE candidates between expert and node sockets.
- **Silent auto-handshake**: When expert requests a stream, the node automatically creates a WebRTC offer without any user intervention on the node side.
- **Camera renegotiation**: Camera switching triggers a full WebRTC renegotiation (new offer) to change the media track's facingMode.
- **Proxy path routing**: `/socket.io` is listed in the API server's `artifact.toml` paths so the reverse proxy correctly forwards WebSocket upgrade requests.

## Product

- **Expert Dashboard (`/expert`)**: Ops-center style view with live list of connected nodes, telemetry stats, and a video stream panel. Expert can select any node, initiate a stream, switch between front/back camera, and reset the node's session.
- **Node Client (`/node`)**: Minimal page that registers the device on load, then passively awaits commands from the expert. Automatically starts the WebRTC handshake when a stream is requested.
- **Landing page (`/`)**: Entry point to choose between Expert mode and Node mode.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- The `/socket.io` path must remain in the API server's `artifact.toml` paths array, otherwise WebSocket connections are silently dropped by the reverse proxy.
- Node pages need camera/microphone permissions — test on a real device or browser with HTTPS.
- WebRTC `getUserMedia` requires HTTPS in production (works on localhost for dev).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
