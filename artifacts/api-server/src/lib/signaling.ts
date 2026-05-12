import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { logger } from "./logger";

export interface ConnectedNode {
  id: string;
  name: string;
  status: "idle" | "streaming" | "busy";
  connectedAt: string;
  socketId: string;
  userAgent: string | null;
}

export interface ActiveSession {
  id: string;
  nodeId: string;
  expertId: string;
  startedAt: string;
  status: "connecting" | "active" | "ended";
}

// In-memory state
const nodes = new Map<string, ConnectedNode>();
const sessions = new Map<string, ActiveSession>();
let sessionCounter = 0;
let sessionsToday = 0;

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

export function getNodes(): ConnectedNode[] {
  return Array.from(nodes.values());
}

export function getSessions(): ActiveSession[] {
  return Array.from(sessions.values()).filter((s) => s.status !== "ended");
}

export function getStats() {
  const allNodes = getNodes();
  const activeSessions = getSessions();
  return {
    totalNodes: allNodes.length,
    activeNodes: allNodes.filter((n) => n.status !== "idle").length,
    activeSessions: activeSessions.length,
    totalSessionsToday: sessionsToday,
  };
}

export function setupSignaling(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.on("connection", (socket: Socket) => {
    const userAgent = socket.handshake.headers["user-agent"] ?? null;
    logger.info({ socketId: socket.id }, "New socket connected");

    // ── Node Registration ────────────────────────────────────────────
    socket.on("node:register", (data: { name?: string }) => {
      const name = data?.name ?? `Node-${socket.id.slice(-4)}`;
      const node: ConnectedNode = {
        id: socket.id,
        name,
        status: "idle",
        connectedAt: new Date().toISOString(),
        socketId: socket.id,
        userAgent: typeof userAgent === "string" ? userAgent : null,
      };
      nodes.set(socket.id, node);
      socket.join("nodes");
      logger.info({ nodeId: socket.id, name }, "Node registered");
      broadcastNodes(io);
    });

    // ── Expert requests stream from a node ───────────────────────────
    socket.on("expert:request-stream", (data: { nodeId: string }) => {
      const { nodeId } = data;
      const node = nodes.get(nodeId);
      if (!node) {
        logger.warn({ nodeId }, "Node not found for stream request");
        return;
      }

      // Create a session
      const sessionId = `session-${++sessionCounter}`;
      const session: ActiveSession = {
        id: sessionId,
        nodeId,
        expertId: socket.id,
        startedAt: new Date().toISOString(),
        status: "connecting",
      };
      sessions.set(sessionId, session);
      sessionsToday++;

      // Mark node as streaming
      node.status = "streaming";
      nodes.set(nodeId, node);

      logger.info({ nodeId, expertId: socket.id, sessionId }, "Stream requested");

      // Tell the node to initiate WebRTC with the expert's socket id
      io.to(nodeId).emit("expert:request-stream", {
        expertSocketId: socket.id,
        sessionId,
      });

      broadcastNodes(io);
    });

    // ── WebRTC Signaling — Offer (node → expert) ─────────────────────
    socket.on(
      "webrtc:offer",
      (data: { offer: Record<string, unknown>; to: string }) => {
        const { offer, to } = data;
        logger.debug({ from: socket.id, to }, "Relaying WebRTC offer");
        io.to(to).emit("webrtc:offer", { offer, from: socket.id });

        // Mark session as active
        for (const [, session] of sessions) {
          if (session.nodeId === socket.id && session.status === "connecting") {
            session.status = "active";
          }
        }
      },
    );

    // ── WebRTC Signaling — Answer (expert → node) ────────────────────
    socket.on(
      "webrtc:answer",
      (data: { answer: Record<string, unknown>; to: string }) => {
        const { answer, to } = data;
        logger.debug({ from: socket.id, to }, "Relaying WebRTC answer");
        io.to(to).emit("webrtc:answer", { answer });
      },
    );

    // ── ICE Candidate Exchange ────────────────────────────────────────
    socket.on(
      "webrtc:ice-candidate",
      (data: { candidate: Record<string, unknown>; to: string }) => {
        const { candidate, to } = data;
        logger.debug({ from: socket.id, to }, "Relaying ICE candidate");
        io.to(to).emit("webrtc:ice-candidate", { candidate });
      },
    );

    // ── Camera Switch (expert → node) ────────────────────────────────
    socket.on(
      "camera:switch",
      (data: { nodeId: string; facingMode: "user" | "environment" }) => {
        const { nodeId, facingMode } = data;
        logger.info({ nodeId, facingMode }, "Camera switch requested");
        io.to(nodeId).emit("camera:switch", { facingMode });
      },
    );

    // ── Session Reset (expert → node) ────────────────────────────────
    socket.on("session:reset", (data: { nodeId: string }) => {
      const { nodeId } = data;
      logger.info({ nodeId }, "Session reset requested");

      // End all sessions for this node
      for (const [, session] of sessions) {
        if (session.nodeId === nodeId && session.status !== "ended") {
          session.status = "ended";
        }
      }

      // Reset node status
      const node = nodes.get(nodeId);
      if (node) {
        node.status = "idle";
        nodes.set(nodeId, node);
      }

      io.to(nodeId).emit("session:reset");
      broadcastNodes(io);
    });

    // ── Disconnect ────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      const wasNode = nodes.has(socket.id);
      nodes.delete(socket.id);

      // End any sessions this socket was involved in
      for (const [, session] of sessions) {
        if (
          (session.nodeId === socket.id ||
            session.expertId === socket.id) &&
          session.status !== "ended"
        ) {
          session.status = "ended";
        }
      }

      if (wasNode) {
        logger.info({ socketId: socket.id, reason }, "Node disconnected");
        broadcastNodes(io);
      } else {
        logger.info({ socketId: socket.id, reason }, "Client disconnected");
      }
    });
  });

  return io;
}

function broadcastNodes(io: SocketIOServer) {
  const nodeList = getNodes().map(({ socketId: _s, ...rest }) => rest);
  io.emit("nodes:updated", nodeList);
}
