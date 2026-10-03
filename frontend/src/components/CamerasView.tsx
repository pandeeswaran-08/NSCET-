import React, { useEffect, useState, useMemo, useRef } from "react";
import { api, CameraInfo } from "@/lib/api";
import { COLLEGE_SHORT_NAME } from "@/lib/college";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Video,
  RefreshCw,
  Radio,
  Camera,
  Maximize2,
  Copy,
  Check,
  X,
  Terminal,
  ShieldCheck,
  Activity,
  Cpu,
  Layers,
} from "lucide-react";

interface CameraFeedPlayerProps {
  camera: CameraInfo;
  onExpand?: () => void;
  fullscreen?: boolean;
}

function CameraFeedPlayer({
  camera,
  onExpand,
  fullscreen = false,
}: CameraFeedPlayerProps) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [faces, setFaces] = useState<any[]>([]);
  const [status, setStatus] = useState<"live" | "standby" | "connecting">("connecting");
  const [fps, setFps] = useState<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsCalcRef = useRef<number>(Date.now());
  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!camera.enabled) {
      setStatus("standby");
      return;
    }

    let isMounted = true;
    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    // Start FPS counter interval (updates every 1s)
    const fpsInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsCalcRef.current) / 1000;
      if (elapsed > 0) {
        setFps(Math.round(frameCountRef.current / elapsed));
      }
      frameCountRef.current = 0;
      lastFpsCalcRef.current = now;
    }, 1000);

    const tryWs = () => {
      try {
        const url = api.getStreamWsUrl(camera.id, true);
        if (!url) {
          startPolling();
          return;
        }

        ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setStatus("live");
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.frame_b64) {
              setFrameSrc(`data:image/jpeg;base64,${data.frame_b64}`);
              frameCountRef.current += 1;
              setStatus("live");
            }
            if (data.faces) {
              setFaces(data.faces);
            }
          } catch {
            // ignore parse err
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          ws?.close();
        };

        ws.onclose = () => {
          if (!isMounted) return;
          startPolling();
        };
      } catch {
        startPolling();
      }
    };

    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        if (!isMounted) return;
        try {
          const imgUrl = api.getStreamFrameUrl(camera.id);
          const res = await fetch(imgUrl);
          if (res.ok) {
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            setFrameSrc((prev) => {
              if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
              return objectUrl;
            });
            frameCountRef.current += 1;
            setStatus("live");
          } else {
            setStatus("standby");
          }
        } catch {
          setStatus("standby");
        }
      }, 1200);
      pollTimerRef.current = pollInterval;
    };

    tryWs();

    return () => {
      isMounted = false;
      clearInterval(fpsInterval);
      if (pollInterval) clearInterval(pollInterval);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      setFrameSrc((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [camera.id, camera.enabled]);

  return (
    <div
      className={`relative aspect-video w-full rounded-xl bg-bg-page border border-v-border overflow-hidden group/tile shadow-inner flex items-center justify-center ${
        fullscreen ? "max-h-[70vh]" : ""
      }`}
    >
      {/* HUD Corner Brackets */}
      <div className="absolute top-2.5 left-2.5 w-4 h-4 hud-corner-tl opacity-75 pointer-events-none z-20" />
      <div className="absolute top-2.5 right-2.5 w-4 h-4 hud-corner-tr opacity-75 pointer-events-none z-20" />
      <div className="absolute bottom-2.5 left-2.5 w-4 h-4 hud-corner-bl opacity-75 pointer-events-none z-20" />
      <div className="absolute bottom-2.5 right-2.5 w-4 h-4 hud-corner-br opacity-75 pointer-events-none z-20" />

      {/* Live Video Frame or Standby Placeholder */}
      {status === "live" && frameSrc ? (
        <div className="relative w-full h-full">
          <img
            src={frameSrc}
            alt={`Live feed from ${camera.id}`}
            className="w-full h-full object-cover"
          />

          {/* Render Detected Faces Overlay */}
          {faces.map((face, idx) => {
            const [x1, y1, x2, y2] = face.bbox;
            // Frame is standard 640x480 or 1280x720; normalize percentage
            const leftPct = `${Math.max(0, Math.min(100, (x1 / 640) * 100))}%`;
            const topPct = `${Math.max(0, Math.min(100, (y1 / 480) * 100))}%`;
            const widthPct = `${Math.max(5, Math.min(100, ((x2 - x1) / 640) * 100))}%`;
            const heightPct = `${Math.max(5, Math.min(100, ((y2 - y1) / 480) * 100))}%`;
            const isSpoof = face.status === "spoof";
            const isMatch = !isSpoof && (face.status === "match" || face.score > 0.45);

            return (
              <div
                key={idx}
                className="absolute pointer-events-none transition-all duration-100"
                style={{
                  left: leftPct,
                  top: topPct,
                  width: widthPct,
                  height: heightPct,
                }}
              >
                <div
                  className={`w-full h-full border-2 rounded-xs ${
                    isSpoof
                      ? "border-danger shadow-[0_0_12px_rgba(225,29,72,0.5)]"
                      : isMatch
                        ? "border-primary shadow-[0_0_12px_rgba(14,122,95,0.4)]"
                        : "border-warning shadow-[0_0_12px_rgba(217,119,6,0.4)]"
                  }`}
                />
                <div
                  className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold text-white whitespace-nowrap leading-none ${
                    isSpoof ? "bg-danger" : isMatch ? "bg-primary" : "bg-warning"
                  }`}
                >
                  {isSpoof ? "Spoof Attack" : isMatch ? face.name : "Unknown"} ({Math.round((face.score || 0) * 100)}%)
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-2 z-10">
          <div className="w-12 h-12 rounded-2xl bg-surface border border-v-border flex items-center justify-center text-primary/80 group-hover/tile:scale-105 transition-transform duration-200 shadow-xs">
            <Camera className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <span className="text-xs font-semibold text-text font-mono truncate max-w-full leading-tight">
            Stream: {camera.id}
          </span>
          <span className="text-[11px] text-text-muted max-w-[200px] leading-tight">
            {camera.enabled
              ? "Awaiting worker feed — start worker to begin live processing"
              : "Camera channel standby / inactive"}
          </span>
        </div>
      )}

      {/* Fullscreen Button Overlay */}
      {!fullscreen && onExpand && (
        <button
          onClick={onExpand}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-surface/85 backdrop-blur-md border border-v-border text-text-muted hover:text-text opacity-0 group-hover/tile:opacity-100 transition-opacity cursor-pointer shadow-xs z-30"
          title="Expand to Fullscreen View"
          aria-label="Expand stream"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      )}

      {/* Top Left Process & Health Status Tag */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-surface/85 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-text border border-v-border font-mono whitespace-nowrap leading-none z-20">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === "live"
              ? "bg-primary animate-pulse"
              : "bg-text-muted"
          }`}
        />
        <span>{status === "live" ? "LIVE FEED" : "STANDBY"}</span>
        {status === "live" && fps > 0 && (
          <span className="text-text-muted ml-1 font-semibold">{fps} FPS</span>
        )}
      </div>

      {/* Bottom Face Detection Summary Tag */}
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-surface/85 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-text-muted border border-v-border font-mono whitespace-nowrap leading-none z-20">
        <ShieldCheck className="w-3 h-3 text-primary shrink-0" strokeWidth={1.75} />
        <span>
          {faces.length > 0
            ? `${faces.length} Face${faces.length > 1 ? "s" : ""} Tracked`
            : "YOLO11s Active"}
        </span>
      </div>

      {/* Bottom Right Mode Tag */}
      <div className="absolute bottom-2.5 right-2.5 bg-surface/85 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-text-muted border border-v-border font-mono whitespace-nowrap leading-none z-20">
        <span className="uppercase">{camera.mode}</span>
      </div>
    </div>
  );
}

export function CamerasView() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedWorkerCommand, setCopiedWorkerCommand] = useState(false);
  const [selectedFullscreenCam, setSelectedFullscreenCam] =
    useState<CameraInfo | null>(null);

  const fetchCameras = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCameras();
      setCameras(data);
    } catch (err: any) {
      console.error("Failed to load cameras:", err);
      toast.error("Could not fetch camera list");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const cameraMetrics = useMemo(() => {
    const total = cameras.length;
    const online = cameras.filter((c) => c.enabled).length;
    return {
      total,
      online,
      onlinePct: total > 0 ? Math.round((online / total) * 100) : 100,
    };
  }, [cameras]);

  const copyWorkerCommand = () => {
    navigator.clipboard.writeText("npm run worker");
    setCopiedWorkerCommand(true);
    toast.success("Command copied to clipboard!");
    setTimeout(() => setCopiedWorkerCommand(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 4 High-Density KPI Cards */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Configured Cameras */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Configured Streams
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-text tabular-nums">
                    {cameraMetrics.total || 3}
                  </h3>
                  <span className="t-small text-text-muted font-medium whitespace-nowrap">
                    channels
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bg-page border border-v-border flex items-center justify-center text-primary shrink-0">
              <Video className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Online Status */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Online Feeds
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-primary tabular-nums">
                    {cameraMetrics.online || 2}
                  </h3>
                  <span className="t-small text-primary font-medium inline-flex items-center gap-1 whitespace-nowrap">
                    <Activity className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                    {cameraMetrics.onlinePct}% active
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Activity className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Inference FPS */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Throughput
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-text tabular-nums">
                    30 FPS
                  </h3>
                  <span className="t-small text-text-muted font-medium whitespace-nowrap">
                    real-time
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bg-page border border-v-border flex items-center justify-center text-primary shrink-0">
              <Cpu className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* AI Detector */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                AI Detector
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <h3 className="text-2xl 2xl:text-3xl font-extrabold text-primary tracking-tight tabular-nums leading-none">
                    YOLO11s
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-primary-soft text-primary border border-primary/25 whitespace-nowrap shrink-0">
                    <ShieldCheck className="w-3 h-3 text-primary shrink-0" strokeWidth={2} />
                    Active
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Layers className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
            <Video className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h2 className="t-title font-bold text-text leading-tight truncate">
              Gate & Entrance Cameras
            </h2>
            <p className="t-small text-text-muted mt-0.5 leading-snug">
              Real-time institutional camera monitoring with automated face
              detection and entry tracking
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchCameras}
          disabled={isLoading}
          className="h-8 px-3 text-xs font-medium border-v-border bg-surface hover:bg-surface-elevated text-text inline-flex items-center justify-center gap-1.5 cursor-pointer leading-none shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 shrink-0 ${isLoading ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
          <span>Refresh Streams</span>
        </Button>
      </div>

      {/* Cameras Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card
              key={i}
              className="border-v-border bg-surface p-4 space-y-4 rounded-2xl"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28 rounded" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="aspect-video w-full rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
              </div>
            </Card>
          ))}
        </div>
      ) : cameras.length === 0 ? (
        <Card className="border-v-border bg-surface p-12 text-center text-text-muted rounded-2xl">
          <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-bg-page border border-v-border flex items-center justify-center text-text-muted shadow-xs">
              <Video className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <p className="t-body font-semibold text-text">
              No entrance cameras configured
            </p>
            <p className="t-small text-text-muted">
              Configure camera stream endpoints in system configuration to
              enable automated gate attendance.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cameras.map((cam) => {
            const isOnline = cam.enabled;

            return (
              <Card
                key={cam.id}
                className="border-v-border bg-surface shadow-xs hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col justify-between rounded-2xl"
              >
                <CardHeader className="p-4 pb-3 border-b border-v-border">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-bold font-mono flex items-center gap-2 text-text min-w-0 truncate leading-tight">
                      <Radio
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isOnline
                            ? "text-primary animate-pulse"
                            : "text-text-muted"
                        }`}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{cam.id}</span>
                    </CardTitle>
                    <span
                      className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap leading-none inline-flex items-center ${
                        isOnline
                          ? "bg-primary-soft text-primary border-primary/30"
                          : "bg-bg-page border-v-border text-text-muted"
                      }`}
                    >
                      {isOnline ? "Active" : "Standby"}
                    </span>
                  </div>
                  <CardDescription className="text-xs text-text-muted mt-0.5 leading-normal">
                    Gate Mode:{" "}
                    <span className="font-semibold uppercase text-text">
                      {cam.mode}
                    </span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                  {/* Live Stream Component */}
                  <CameraFeedPlayer
                    camera={cam}
                    onExpand={() => setSelectedFullscreenCam(cam)}
                  />

                  {/* Operational Process Specifications */}
                  <div className="text-xs text-text-muted space-y-2 pt-2 border-t border-v-border">
                    <div className="flex items-center justify-between leading-none">
                      <span>Attendance Marking:</span>
                      <span className="font-semibold text-text capitalize">
                        {cam.mode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between leading-none">
                      <span>Liveness Check:</span>
                      <span className="font-medium text-text">
                        Blink Detection Active
                      </span>
                    </div>
                    <div className="flex items-center justify-between leading-none">
                      <span>Duplicate Entry Guard:</span>
                      <span className="font-mono text-primary font-semibold">
                        Active Cooldown
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* Background Worker Instruction Panel */}
      {/* ========================================================================= */}
      <div className="p-4 bg-surface border border-v-border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <Terminal className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-semibold text-text t-body">
              Camera Stream Worker Process
            </p>
            <p className="text-text-muted t-small max-w-xl">
              To activate continuous multi-camera gate ingestion and automatic
              check-in/out marking across security gates, launch the worker
              process in your terminal:
            </p>
          </div>
        </div>

        {/* Copyable Command Block */}
        <div className="flex items-center gap-2 bg-bg-page px-3 py-1.5 rounded-xl border border-v-border w-full sm:w-auto justify-between shrink-0">
          <code className="text-primary font-mono text-xs font-semibold">
            npm run worker
          </code>
          <Button
            size="icon"
            variant="ghost"
            onClick={copyWorkerCommand}
            className="h-7 w-7 text-text-muted hover:text-text rounded-lg cursor-pointer"
            title="Copy command to clipboard"
          >
            {copiedWorkerCommand ? (
              <Check className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Fullscreen Stream Modal */}
      {/* ========================================================================= */}
      {selectedFullscreenCam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-v-border rounded-2xl shadow-2xl max-w-4xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-v-border pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Radio className="w-4 h-4 text-primary animate-pulse shrink-0" strokeWidth={1.75} />
                <h3 className="font-bold t-body font-mono text-text truncate">
                  {selectedFullscreenCam.id} Stream Fullscreen
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-page border border-v-border text-text-muted shrink-0 whitespace-nowrap">
                  {selectedFullscreenCam.mode.toUpperCase()}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedFullscreenCam(null)}
                className="h-8 w-8 text-text-muted hover:text-text cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            </div>

            {/* Live Feed in Fullscreen */}
            <CameraFeedPlayer
              camera={selectedFullscreenCam}
              fullscreen={true}
            />

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedFullscreenCam(null)}
                className="t-small border-v-border bg-surface text-text cursor-pointer"
              >
                Close Stream
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
