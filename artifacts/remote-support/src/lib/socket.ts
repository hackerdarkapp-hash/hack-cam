import { io, Socket } from "socket.io-client";

  /**
   * Singleton Socket.io client with aggressive reconnection settings.
   * Auto-connects on module load — no manual trigger required.
   * Used by both the Node client and the Expert dashboard.
   *
   * VITE_API_URL must point to the API server when frontend and API
   * are hosted on different origins (e.g. separate Render services).
   */
  const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

  export const socket: Socket = io(API_URL, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.4,
    timeout: 20_000,
    ackTimeout: 10_000,
  });
  