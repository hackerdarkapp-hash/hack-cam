import { useEffect, useRef, useState, useCallback } from "react";
import { 
  useListNodes, 
  useListSessions, 
  useGetStats,
  getListNodesQueryKey,
  getListSessionsQueryKey 
} from "@workspace/api-client-react";
import { socket } from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Video, HardDrive, RefreshCw, SwitchCamera } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Node } from "@workspace/api-client-react/src/generated/api.schemas";

export default function ExpertDashboard() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useGetStats({ query: { refetchInterval: 5000 } });
  const { data: nodes, isLoading: nodesLoading } = useListNodes({ query: { refetchInterval: 5000 } });
  const { data: sessions } = useListSessions({ query: { refetchInterval: 5000 } });

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("disconnected");
  const [currentFacing, setCurrentFacing] = useState<"user" | "environment">("environment");

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize socket listeners
  useEffect(() => {
    const onNodesUpdated = (updatedNodes: Node[]) => {
      queryClient.setQueryData(getListNodesQueryKey(), updatedNodes);
    };

    const onWebRTCOffer = async ({ offer, from }: { offer: RTCSessionDescriptionInit, from: string }) => {
      console.log("Received WebRTC offer from", from);
      setConnectionState("negotiating");
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      pc.ontrack = (event) => {
        console.log("Received remote track");
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          setStreamActive(true);
          setConnectionState("connected");
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { candidate: event.candidate, to: from });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        setConnectionState(pc.iceConnectionState);
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          setStreamActive(false);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit("webrtc:answer", { answer, to: from });
      peerConnection.current = pc;
    };

    const onIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (peerConnection.current) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding received ice candidate", e);
        }
      }
    };

    socket.on("nodes:updated", onNodesUpdated);
    socket.on("webrtc:offer", onWebRTCOffer);
    socket.on("webrtc:ice-candidate", onIceCandidate);

    return () => {
      socket.off("nodes:updated", onNodesUpdated);
      socket.off("webrtc:offer", onWebRTCOffer);
      socket.off("webrtc:ice-candidate", onIceCandidate);
    };
  }, [queryClient]);

  const requestStream = (nodeId: string) => {
    setActiveNodeId(nodeId);
    setStreamActive(false);
    setConnectionState("requesting");
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    socket.emit("expert:request-stream", { nodeId });
  };

  const switchCamera = () => {
    if (activeNodeId) {
      const nextMode = currentFacing === "environment" ? "user" : "environment";
      setCurrentFacing(nextMode);
      socket.emit("camera:switch", { nodeId: activeNodeId, facingMode: nextMode });
    }
  };

  const resetSession = () => {
    if (activeNodeId) {
      socket.emit("session:reset", { nodeId: activeNodeId });
      setActiveNodeId(null);
      setStreamActive(false);
      setConnectionState("disconnected");
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    }
  };

  const getNodeStatusColor = (status: string) => {
    switch(status) {
      case "idle": return "border-muted-foreground text-muted-foreground";
      case "streaming": return "border-primary text-primary shadow-[0_0_10px_rgba(0,255,170,0.5)]";
      case "busy": return "border-destructive text-destructive";
      default: return "border-muted text-muted";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex items-center gap-4">
          <Activity className="text-primary w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold tracking-widest uppercase">SYS_OP_CENTER</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Global Network Overview</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">System Status</span>
            <span className="text-primary font-bold tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              ONLINE
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        
        {/* Left Column: Stats & Node List */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card className="border-border bg-card rounded-none rounded-tl-xl">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                <HardDrive className="w-4 h-4" /> Telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-4">
              {statsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground uppercase">Total Nodes</span>
                    <span className="font-bold text-lg">{stats?.totalNodes || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground uppercase">Active Nodes</span>
                    <span className="font-bold text-lg text-primary">{stats?.activeNodes || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground uppercase">Active Sessions</span>
                    <span className="font-bold text-lg">{stats?.activeSessions || 0}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1 border-border bg-card rounded-none flex flex-col min-h-[400px]">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-sm uppercase tracking-widest flex justify-between items-center">
                <span>Network Nodes</span>
                <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                  {nodes?.length || 0}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex-1 overflow-auto p-0">
              {nodesLoading ? (
                 <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : nodes?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm uppercase tracking-wider">No nodes connected</div>
              ) : (
                <div className="flex flex-col">
                  {nodes?.map(node => (
                    <div 
                      key={node.id} 
                      className={`p-4 border-b border-border/50 flex flex-col gap-3 transition-colors cursor-pointer ${activeNodeId === node.id ? 'bg-accent/50' : 'hover:bg-accent/30'}`}
                      onClick={() => requestStream(node.id)}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold truncate">{node.name}</span>
                        <Badge variant="outline" className={`uppercase text-[10px] px-1.5 py-0 rounded-none border ${getNodeStatusColor(node.status)}`}>
                          {node.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="truncate max-w-[150px]">{node.id}</span>
                        <span>{new Date(node.connectedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Video Stream */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <Card className="flex-1 border-border bg-card rounded-none rounded-br-xl rounded-tr-xl flex flex-col overflow-hidden relative">
            
            <div className="absolute top-4 left-4 z-10 flex gap-2">
               {activeNodeId && (
                 <Badge variant="outline" className="bg-background/80 backdrop-blur text-primary border-primary rounded-none uppercase tracking-wider">
                   TARGET: {activeNodeId}
                 </Badge>
               )}
               {connectionState !== 'disconnected' && (
                 <Badge variant="outline" className="bg-background/80 backdrop-blur text-foreground border-border rounded-none uppercase tracking-wider">
                   LINK: {connectionState}
                 </Badge>
               )}
            </div>

            <div className="flex-1 bg-black relative flex items-center justify-center border-b border-border min-h-[400px]">
              
              {!activeNodeId ? (
                <div className="text-center flex flex-col items-center gap-4 text-muted-foreground">
                  <Video className="w-16 h-16 opacity-20" />
                  <p className="uppercase tracking-widest text-sm">Awaiting Target Selection</p>
                </div>
              ) : !streamActive ? (
                <div className="text-center flex flex-col items-center gap-4 text-primary">
                  <Loader2 className="w-12 h-12 animate-spin" />
                  <p className="uppercase tracking-widest text-sm animate-pulse">Establishing Uplink...</p>
                </div>
              ) : null}

              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className={`w-full h-full object-contain ${streamActive ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}
              />
              
              {/* Scanlines overlay effect */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20"></div>
            </div>

            <div className="p-4 flex items-center justify-between bg-accent/20">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-none border-primary text-primary hover:bg-primary hover:text-primary-foreground uppercase tracking-widest text-xs"
                  onClick={switchCamera}
                  disabled={!streamActive}
                >
                  <SwitchCamera className="w-4 h-4 mr-2" />
                  Switch Feed
                </Button>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground uppercase tracking-widest text-xs"
                onClick={resetSession}
                disabled={!activeNodeId}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Terminate Link
              </Button>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
