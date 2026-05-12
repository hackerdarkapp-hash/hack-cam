import { useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";

type StreamStatus = "idle" | "initializing" | "streaming" | "error";

export default function NodeClient() {
  const [networkStatus, setNetworkStatus] = useState<"connecting" | "online">("connecting");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [nodeId, setNodeId] = useState<string>("");
  const [nodeName, setNodeName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [time, setTime] = useState(new Date());

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const expertSocketRef = useRef<string>("");
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Clock tick — 1 s interval
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Wake Lock — keeps screen from sleeping while camera is active
  const acquireWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch { /* non-critical */ }
  };

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && streamStatus === "streaming") {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [streamStatus]);

  const stopStream = () => {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    peerConnection.current?.close();
    peerConnection.current = null;
    releaseWakeLock();
    setStreamStatus("idle");
  };

  const startStream = async (expertSocketId: string, mode: "user" | "environment") => {
    try {
      setStreamStatus("initializing");
      setError(null);
      expertSocketRef.current = expertSocketId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      });

      localStream.current = stream;
      await acquireWakeLock();

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      });

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { candidate: event.candidate, to: expertSocketId });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          stopStream();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { offer, to: expertSocketId });

      peerConnection.current = pc;
      setStreamStatus("streaming");
    } catch {
      setError("Camera or microphone access denied.");
      setStreamStatus("error");
    }
  };

  const renegotiateCamera = async (mode: "user" | "environment") => {
    if (!peerConnection.current || !expertSocketRef.current) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      const videoTrack = newStream.getVideoTracks()[0];
      const sender = peerConnection.current
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender && videoTrack) await sender.replaceTrack(videoTrack);
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = newStream;
      setFacingMode(mode);
    } catch { /* non-critical if renegotiation fails */ }
  };

  useEffect(() => {
    const name = `CAM-${Math.floor(Math.random() * 9000 + 1000)}`;
    setNodeName(name);

    const register = () => {
      setNetworkStatus("online");
      setNodeId(socket.id ?? "");
      socket.emit("node:register", { name });
    };

    socket.on("connect", register);
    if (socket.connected) register();
    socket.on("disconnect", () => setNetworkStatus("connecting"));

    const onRequestStream = ({ expertSocketId }: { expertSocketId: string }) =>
      startStream(expertSocketId, facingMode);

    const onAnswer = async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      if (peerConnection.current)
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const onIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (peerConnection.current) {
        try { await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch { /* non-fatal */ }
      }
    };

    const onCameraSwitch = ({ facingMode: mode }: { facingMode: "user" | "environment" }) =>
      renegotiateCamera(mode);

    const onSessionReset = () => {
      stopStream();
      setTimeout(() => window.location.reload(), 800);
    };

    socket.on("expert:request-stream", onRequestStream);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice-candidate", onIceCandidate);
    socket.on("camera:switch", onCameraSwitch);
    socket.on("session:reset", onSessionReset);

    return () => {
      socket.off("connect", register);
      socket.off("disconnect");
      socket.off("expert:request-stream", onRequestStream);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice-candidate", onIceCandidate);
      socket.off("camera:switch", onCameraSwitch);
      socket.off("session:reset", onSessionReset);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;

  // Colour palette — everything is very dim on pure black for low-light environments
  const DIM = "#1a2e1a";      // barely-visible dark green
  const DIMMER = "#0e1a0e";   // almost-black green for secondary text
  const ACTIVE = "#22c55e";   // brighter only when live
  const ERROR = "#7f1d1d";    // muted red

  const dotColor =
    streamStatus === "streaming" ? ACTIVE :
    streamStatus === "error"     ? ERROR  :
    networkStatus === "online"   ? DIM    : "#111";

  const dotGlow =
    streamStatus === "streaming"
      ? "0 0 8px #22c55e88, 0 0 24px #22c55e33"
      : "none";

  const statusText =
    streamStatus === "streaming"   ? "SYSTEM ACTIVE"       :
    streamStatus === "initializing"? "ESTABLISHING LINK"   :
    streamStatus === "error"       ? "PERMISSION REQUIRED" :
    networkStatus === "online"     ? "STANDBY"             : "OFFLINE";

  const statusColor =
    streamStatus === "streaming"    ? ACTIVE :
    streamStatus === "error"        ? ERROR  :
    networkStatus === "online"      ? DIM    : "#111";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #000; height: 100%; overflow: hidden; }
        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>

      {/* ── Root — full viewport, pure black, nothing scrolls ───────── */}
      <div style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        fontFamily: "'Courier New', Courier, monospace",
        color: DIM,
        userSelect: "none",
        WebkitUserSelect: "none",
        overflow: "hidden",
      }}>

        {/* ── Top bar — fixed, minimal ─────────────────────────────── */}
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: `1px solid ${DIMMER}`,
          fontSize: "10px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: DIMMER,
          zIndex: 10,
        }}>
          <span>{nodeName || "INIT..."}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{timeStr}</span>
        </div>

        {/* ── Centre content ───────────────────────────────────────── */}
        <div style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "28px",
          paddingTop: "32px",
          paddingBottom: "28px",
        }}>
          {/* Status dot */}
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: dotColor,
            boxShadow: dotGlow,
            animation: streamStatus === "streaming"
              ? "breathe 3s ease-in-out infinite"
              : streamStatus === "initializing"
              ? "blink 1s step-end infinite"
              : "none",
          }} />

          {/* Main status label */}
          <div style={{
            fontSize: "13px",
            fontWeight: "bold",
            letterSpacing: "6px",
            textTransform: "uppercase",
            color: statusColor,
          }}>
            {statusText}
          </div>

          {/* Info table */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minWidth: "240px",
          }}>
            {[
              ["NODE",    nodeName || "---"],
              ["ID",      nodeId ? nodeId.slice(-8).toUpperCase() : "---"],
              ["NETWORK", networkStatus === "online" ? "SECURE" : "CONNECTING"],
              ["CAMERA",  facingMode === "environment" ? "REAR" : "FRONT"],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: DIMMER,
              }}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>

          {/* Error notice — muted red, only when needed */}
          {error && (
            <div style={{
              fontSize: "10px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: ERROR,
              textAlign: "center",
              maxWidth: "260px",
              padding: "8px 16px",
              border: `1px solid ${ERROR}`,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Bottom bar — fixed ───────────────────────────────────── */}
        <div style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 16px",
          borderTop: `1px solid ${DIMMER}`,
          fontSize: "9px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: DIMMER,
          zIndex: 10,
        }}>
          <span>AUTHORIZED ACCESS ONLY</span>
          <span style={{
            color: streamStatus === "streaming" ? ACTIVE : DIMMER,
          }}>
            {streamStatus === "streaming" ? "● LIVE" : "○ IDLE"}
          </span>
        </div>

      </div>
    </>
  );
}
