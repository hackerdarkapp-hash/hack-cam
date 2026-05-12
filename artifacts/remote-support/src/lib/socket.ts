import { io, Socket } from "socket.io-client";

/**
 * Singleton Socket.io client with aggressive reconnection settings.
 * Auto-connects on module load — no manual trigger required.
 * Used by both the Node client and the Expert dashboard.
 */
export const socket: Socket = io(window.location.origin, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  // Reconnection — exponential back-off capped at 10 s
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 10_000,
  randomizationFactor: 0.4,
  // Keep the connection alive through proxies
  timeout: 20_000,
  ackTimeout: 10_000,
});
