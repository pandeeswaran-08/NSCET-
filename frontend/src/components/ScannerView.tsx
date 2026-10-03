import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { api, FaceResult } from "@/lib/api";
import { SYSTEM_PROCESSES, COLLEGE_SHORT_NAME } from "@/lib/college";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  RefreshCw,
  Upload,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Volume2,
  VolumeX,
  Scan,
  ShieldCheck,
  Layers,
  Clock,
  ChevronDown,
} from "lucide-react";

interface RecentScan {
  id: string;
  timestamp: string;
  name: string;
  score: number;
  status: string;
  marked: string | null;
}

export function ScannerView({
  onAttendanceMarked,
}: {
  onAttendanceMarked?: () => void;
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [activeFaces, setActiveFaces] = useState<FaceResult[]>([]);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [autoScan, setAutoScan] = useState(true);
  const [markAttendance, setMarkAttendance] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeSideTab, setActiveSideTab] = useState<"feed" | "processes">(
    "feed",
  );
  const [scanPulseState, setScanPulseState] = useState<
    "idle" | "success" | "error"
  >("idle");

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraPermission, setCameraPermission] = useState<
    "prompt" | "granted" | "denied"
  >("prompt");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Debouncing refs for audio & toast
  const lastScannedNameRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  // Web Audio Context synthesizer for verification chime
  const playFeedbackAudio = useCallback(
    (type: "success" | "fail") => {
      if (!soundEnabled) return;
      try {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === "success") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc.frequency.exponentialRampToValueAtTime(
            659.25,
            ctx.currentTime + 0.1,
          ); // E5
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } else {
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, ctx.currentTime);
          osc.frequency.setValueAtTime(196, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        }
      } catch {
        // Audio error ignore
      }
    },
    [soundEnabled],
  );

  // Enumerate video devices
  const updateDeviceList = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch {
      // Ignored
    }
  }, [selectedDeviceId]);

  // Stop camera stream safely
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setActiveFaces([]);

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (hudCanvasRef.current) {
      const ctx = hudCanvasRef.current.getContext("2d");
      ctx?.clearRect(
        0,
        0,
        hudCanvasRef.current.width,
        hudCanvasRef.current.height,
      );
    }
  }, []);

  // Start webcam stream with selected device
  const startCameraStream = useCallback(
    async (deviceId?: string) => {
      setErrorMessage(null);
      setPreviewImage(null);
      setIsModelLoading(true);

      try {
        stopCameraStream();
        const targetDeviceId = deviceId || selectedDeviceId;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: targetDeviceId ? undefined : "user",
          },
          audio: false,
        });

        streamRef.current = stream;
        setCameraPermission("granted");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsStreaming(true);
          updateDeviceList();
        }
      } catch (err: any) {
        console.error("Camera startup error:", err);
        setCameraPermission("denied");
        setErrorMessage(
          err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access in your browser settings."
            : "Could not initialize entrance camera: " + err.message,
        );
      } finally {
        setIsModelLoading(false);
      }
    },
    [selectedDeviceId, stopCameraStream, updateDeviceList],
  );

  // Render institutional scanning reticle & animated laser guide
  useEffect(() => {
    if (!isStreaming) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let scanLineY = 0;
    let scanDirection = 1;

    const renderHud = () => {
      const canvas = hudCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) {
        animFrameRef.current = requestAnimationFrame(renderHud);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      if (!autoScan) {
        animFrameRef.current = requestAnimationFrame(renderHud);
        return;
      }

      // Smooth oscillating scan laser
      scanLineY += scanDirection * 2.2;
      if (scanLineY > h - 10) scanDirection = -1;
      if (scanLineY < 10) scanDirection = 1;

      // Laser line
      const gradient = ctx.createLinearGradient(0, scanLineY, w, scanLineY);
      gradient.addColorStop(0, "rgba(14, 122, 95, 0)");
      gradient.addColorStop(0.5, "rgba(14, 122, 95, 0.75)");
      gradient.addColorStop(1, "rgba(14, 122, 95, 0)");

      ctx.lineWidth = 2;
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, scanLineY);
      ctx.lineTo(w, scanLineY);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(renderHud);
    };

    animFrameRef.current = requestAnimationFrame(renderHud);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isStreaming, autoScan]);

  // Clean-up camera on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Draw face bounding boxes with institutional HUD aesthetics
  // Fixed 24px tab height, flush with box border, white text, WCAG AA compliant colors
  const drawFaceOverlays = useCallback(
    (faces: FaceResult[], renderWidth: number, renderHeight: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = renderWidth;
      canvas.height = renderHeight;
      ctx.clearRect(0, 0, renderWidth, renderHeight);

      if (faces.length === 0) return;

      faces.forEach((face) => {
        const [x1, y1, x2, y2] = face.bbox;
        const w = x2 - x1;
        const h = y2 - y1;
        const isSpoof = face.status === "spoof";
        const isMatch =
          !isSpoof &&
          (face.status === "match" ||
          (face.person_id !== null && face.score > 0.45));

        // WCAG AA compliant colors via getComputedStyle
        const styles = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
        const primaryColor = styles?.getPropertyValue("--primary").trim() || "currentColor";
        const warningTabColor = styles?.getPropertyValue("--warning-tab").trim() || "currentColor";
        const dangerColor = styles?.getPropertyValue("--danger").trim() || "#e11d48";
        const strokeColor = isSpoof ? dangerColor : isMatch ? primaryColor : warningTabColor;

        // Ambient subtle glow
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.75;
        ctx.strokeStyle = strokeColor;
        ctx.strokeRect(x1, y1, w, h);
        ctx.shadowBlur = 0;

        // Precision corner brackets (8px to 18px length)
        const cornerLen = Math.min(18, Math.max(8, w / 4));
        ctx.lineWidth = 3;
        ctx.strokeStyle = strokeColor;

        // TL
        ctx.beginPath();
        ctx.moveTo(x1, y1 + cornerLen);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + cornerLen, y1);
        ctx.stroke();

        // TR
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + cornerLen);
        ctx.stroke();

        // BL
        ctx.beginPath();
        ctx.moveTo(x1, y2 - cornerLen);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1 + cornerLen, y2);
        ctx.stroke();

        // BR
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y2);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, y2 - cornerLen);
        ctx.stroke();

        // Fixed 24px height label tab flush with top border
        const labelName = isSpoof
          ? "Spoof Attack"
          : isMatch
            ? face.name
            : "Unregistered Face";
        const scorePct = Math.round(face.score * 100);
        const topText = isSpoof
          ? "Presentation Attack"
          : isMatch
            ? `${labelName} (${scorePct}%)`
            : "Unregistered Individual";

        ctx.font = "600 11px Inter, system-ui, sans-serif";
        const textWidth = ctx.measureText(topText).width;
        const pillWidth = Math.max(textWidth + 18, 90);
        const pillHeight = 24; // Fixed 24px height
        const pillY = y1 - pillHeight; // Sits flush on top border (no gap)

        // Tab background: solid danger, emerald or solid dark amber
        ctx.fillStyle = isSpoof ? dangerColor : isMatch ? primaryColor : warningTabColor;
        ctx.beginPath();
        ctx.roundRect(x1, pillY, pillWidth, pillHeight, [4, 4, 0, 0]);
        ctx.fill();

        // Tab text: White, vertically centered
        ctx.fillStyle = "white";
        ctx.textBaseline = "middle";
        ctx.fillText(topText, x1 + 9, pillY + pillHeight / 2);
      });
    },
    [],
  );

  // Capture frame & perform recognition
  const captureAndRecognize = useCallback(async () => {
    if (isEvaluating) return;
    let blob: Blob | null = null;
    let renderW = 640;
    let renderH = 480;
    let captureW = 640;
    let captureH = 480;

    if (isStreaming && videoRef.current) {
      const v = videoRef.current;
      if (v.videoWidth === 0) return;
      renderW = v.videoWidth;
      renderH = v.videoHeight;
      captureW = renderW;
      captureH = renderH;

      if (hudCanvasRef.current) {
        if (hudCanvasRef.current.width !== renderW)
          hudCanvasRef.current.width = renderW;
        if (hudCanvasRef.current.height !== renderH)
          hudCanvasRef.current.height = renderH;
      }

      const maxDim = 960;
      if (captureW > maxDim) {
        const scale = maxDim / captureW;
        captureW = Math.round(captureW * scale);
        captureH = Math.round(captureH * scale);
      }

      const offscreen = document.createElement("canvas");
      offscreen.width = captureW;
      offscreen.height = captureH;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, captureW, captureH);

      blob = await new Promise<Blob | null>((resolve) =>
        offscreen.toBlob(resolve, "image/jpeg", 0.85),
      );
    }

    if (!blob) return;

    setIsEvaluating(true);
    try {
      const res = await api.recognize(blob, markAttendance, "kiosk_scanner");
      const scaleX = renderW / captureW;
      const scaleY = renderH / captureH;
      const scaledFaces: FaceResult[] = res.faces.map((f) => ({
        ...f,
        bbox: [
          Math.round(f.bbox[0] * scaleX),
          Math.round(f.bbox[1] * scaleY),
          Math.round(f.bbox[2] * scaleX),
          Math.round(f.bbox[3] * scaleY),
        ] as [number, number, number, number],
      }));

      setActiveFaces(scaledFaces);
      drawFaceOverlays(scaledFaces, renderW, renderH);

      if (res.faces.length > 0) {
        const topFace = res.faces[0];
        const isSpoof = topFace.status === "spoof";
        const isMatch =
          !isSpoof &&
          (topFace.status === "match" ||
          (topFace.person_id !== null && topFace.score > 0.45));
        const now = Date.now();

        // Duplicate debounce: do not spam toasts/audio if same person within 3.5s
        const isDuplicate =
          lastScannedNameRef.current === topFace.name &&
          now - lastScanTimeRef.current < 3500;

        if (!isDuplicate) {
          lastScannedNameRef.current = topFace.name;
          lastScanTimeRef.current = now;

          if (isSpoof) {
            setScanPulseState("error");
            playFeedbackAudio("fail");
            toast.error(
              "Anti-Spoofing Alert: Presentation attack detected. Live face required.",
            );
          } else if (isMatch) {
            setScanPulseState("success");
            playFeedbackAudio("success");
            if (topFace.marked) {
              toast.success(
                `Attendance Recorded: ${topFace.name} (${topFace.marked === "check_in" ? "Check-In" : "Check-Out"})`,
              );
              onAttendanceMarked?.();
            }
          } else {
            setScanPulseState("error");
            playFeedbackAudio("fail");
            toast.warning(
              "Unrecognized face detected. Please ensure you are enrolled.",
            );
          }

          setTimeout(() => setScanPulseState("idle"), 1200);
        }

        // Add to recent activity log
        res.faces.forEach((f) => {
          setRecentScans((prev) => [
            {
              id: `${Date.now()}-${Math.random()}`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              name: f.name,
              score: f.score,
              status: f.status || "unknown",
              marked: f.marked || null,
            },
            ...prev.slice(0, 9),
          ]);
        });
      } else {
        drawFaceOverlays([], renderW, renderH);
      }
    } catch (err: any) {
      console.warn("Scan evaluation:", err.message);
    } finally {
      setIsEvaluating(false);
    }
  }, [
    isStreaming,
    isEvaluating,
    markAttendance,
    playFeedbackAudio,
    drawFaceOverlays,
    onAttendanceMarked,
  ]);

  // Periodic Auto-Scanner Loop (every 1.4s)
  useEffect(() => {
    if (!isStreaming || !autoScan) return;
    const interval = setInterval(() => {
      captureAndRecognize();
    }, 1400);
    return () => clearInterval(interval);
  }, [isStreaming, autoScan, captureAndRecognize]);

  // File Upload verification test
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCameraStream();
    const objectUrl = URL.createObjectURL(file);
    setPreviewImage(objectUrl);
    setIsEvaluating(true);
    setErrorMessage(null);

    const img = new Image();
    img.src = objectUrl;
    img.onload = async () => {
      try {
        const res = await api.recognize(file, markAttendance, "upload_portal");
        setActiveFaces(res.faces);
        drawFaceOverlays(res.faces, img.naturalWidth, img.naturalHeight);

        if (res.faces.length > 0) {
          const top = res.faces[0];
          const isMatch =
            top.status === "match" ||
            (top.person_id !== null && top.score > 0.45);
          if (isMatch) {
            setScanPulseState("success");
            playFeedbackAudio("success");
            toast.success(`Identified: ${top.name}`);
            if (top.marked) onAttendanceMarked?.();
          } else {
            setScanPulseState("error");
            playFeedbackAudio("fail");
            toast.warning("Unregistered face in uploaded photo.");
          }
          setTimeout(() => setScanPulseState("idle"), 1200);

          res.faces.forEach((f) => {
            setRecentScans((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
                name: f.name,
                score: f.score,
                status: f.status || "unknown",
                marked: f.marked || null,
              },
              ...prev.slice(0, 9),
            ]);
          });
        } else {
          toast.info(
            "No face detected. Please ensure clear lighting and upright posture.",
          );
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to process photo");
      } finally {
        setIsEvaluating(false);
      }
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ========================================================================= */}
      {/* Primary Hero Viewport (8 Columns) */}
      {/* ========================================================================= */}
      <div className="lg:col-span-8 space-y-4">
        {/* Viewport Frame */}
        <div
          className={`relative aspect-video w-full rounded-2xl overflow-hidden bg-surface border transition-all duration-300 shadow-md flex items-center justify-center group ${
            scanPulseState === "success"
              ? "border-primary shadow-[0_0_24px_rgba(14,122,95,0.35)]"
              : scanPulseState === "error"
                ? "border-danger shadow-[0_0_24px_rgba(217,54,54,0.35)] animate-shake"
                : "border-v-border"
          }`}
        >
          {/* Static Corner Brackets */}
          <div className="absolute top-4 left-4 w-6 h-6 hud-corner-tl pointer-events-none z-20 opacity-80" />
          <div className="absolute top-4 right-4 w-6 h-6 hud-corner-tr pointer-events-none z-20 opacity-80" />
          <div className="absolute bottom-4 left-4 w-6 h-6 hud-corner-bl pointer-events-none z-20 opacity-80" />
          <div className="absolute bottom-4 right-4 w-6 h-6 hud-corner-br pointer-events-none z-20 opacity-80" />

          {/* Top & Bottom Video Gradient Scrims for Maximum Legibility */}
          <div className="absolute top-0 left-0 right-0 h-20 vantage-scrim-top pointer-events-none z-15" />
          <div className="absolute bottom-0 left-0 right-0 h-20 vantage-scrim-bottom pointer-events-none z-15" />

          {/* Video Stream Element */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isStreaming ? "opacity-100" : "hidden"
            }`}
          />

          {/* Uploaded Image Preview */}
          {previewImage && !isStreaming && (
            <img
              src={previewImage}
              alt="Scanned Preview"
              className="w-full h-full object-contain"
            />
          )}

          {/* Decoupled Canvas Layers */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
          />

          <canvas
            ref={hudCanvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-15"
          />

          {/* Model Loading State Overlay */}
          {isModelLoading && (
            <div className="absolute inset-0 z-30 bg-surface/85 backdrop-blur-md flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" strokeWidth={1.75} />
              <p className="t-small font-semibold text-text tracking-wide">
                Connecting to entrance video camera...
              </p>
            </div>
          )}

          {/* Permission Denied Overlay */}
          {cameraPermission === "denied" && (
            <div className="absolute inset-0 z-30 bg-surface/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-danger-soft border border-danger/30 flex items-center justify-center text-danger">
                <AlertTriangle className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <h3 className="t-title text-text">
                Camera Permission Blocked
              </h3>
              <p className="t-small text-text-muted max-w-sm">
                Camera access was blocked by your browser. Please allow
                permission to activate entrance scanner.
              </p>
              <Button
                size="sm"
                onClick={() => startCameraStream()}
                className="bg-primary text-white hover:bg-primary-600 t-small gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} /> Retry Camera Access
              </Button>
            </div>
          )}

          {/* Standby / Off State */}
          {!isStreaming &&
            !previewImage &&
            !isModelLoading &&
            cameraPermission !== "denied" && (
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 z-10">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shadow-inner transition-transform duration-300 group-hover:scale-105">
                    <Camera className="w-9 h-9" strokeWidth={1.75} />
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface border-2 border-surface flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-primary/60" />
                  </span>
                </div>
                <div>
                  <h3 className="t-title text-text tracking-tight">
                    {COLLEGE_SHORT_NAME} Entrance Scanner
                  </h3>
                  <p className="t-small text-text-muted max-w-md mt-1 leading-relaxed">
                    Stand in front of the camera or upload an image to verify institutional attendance.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Button
                    onClick={() => startCameraStream()}
                    className="h-10 px-5 bg-primary text-white hover:bg-primary-600 font-semibold t-small gap-2 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" strokeWidth={1.75} /> Start Camera Scanner
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 px-4 gap-2 t-small font-medium border-v-border bg-surface hover:bg-surface-elevated text-text rounded-xl cursor-pointer shadow-xs"
                  >
                    <Upload className="w-4 h-4" strokeWidth={1.75} /> Upload Photo
                  </Button>
                </div>
              </div>
            )}

          {/* Top Floating Badge Bar with Text-Shadow and Scrim Protection */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <Badge
                variant="outline"
                className={`text-[11px] font-mono py-1 px-3 rounded-full border backdrop-blur-md whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,0.7)] ${
                  isStreaming
                    ? "bg-surface/90 text-primary border-primary/40 shadow-xs"
                    : "bg-surface/90 text-text-muted border-v-border"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full mr-2 inline-block shrink-0 ${
                    isStreaming ? "bg-primary animate-ping" : "bg-text-muted"
                  }`}
                />
                {isStreaming ? "SCANNER ACTIVE" : "STANDBY"}
              </Badge>

              {isEvaluating && (
                <Badge
                  variant="outline"
                  className="bg-surface/90 backdrop-blur-md text-primary border-primary/40 text-[10px] font-mono py-1 px-2.5 animate-in fade-in whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5 animate-spin inline shrink-0" strokeWidth={1.75} />
                  VERIFYING BIOMETRICS
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="h-8 w-8 rounded-xl bg-surface/90 backdrop-blur-md border-v-border text-text-muted hover:text-text shadow-xs cursor-pointer"
                title={soundEnabled ? "Mute audio chimes" : "Enable audio chimes"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
                ) : (
                  <VolumeX className="w-4 h-4" strokeWidth={1.75} />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Dedicated Control & Settings Dock */}
        <div className="p-3.5 rounded-2xl bg-surface border border-v-border shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Stream / Photo Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {isStreaming ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={stopCameraStream}
                  className="h-9 px-4 t-small font-semibold gap-1.5 rounded-xl cursor-pointer shadow-xs"
                >
                  <CameraOff className="w-3.5 h-3.5" strokeWidth={1.75} /> Stop Stream
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={captureAndRecognize}
                  disabled={isEvaluating}
                  className="h-9 px-3.5 t-small font-medium border-v-border bg-surface hover:bg-surface-elevated text-text gap-1.5 rounded-xl cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isEvaluating ? "animate-spin" : ""}`}
                    strokeWidth={1.75}
                  />
                  Scan Now
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => startCameraStream()}
                  className="h-9 px-4 bg-primary text-white hover:bg-primary-600 t-small font-semibold gap-1.5 rounded-xl cursor-pointer shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" strokeWidth={1.75} /> Start Camera
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-3.5 t-small font-medium border-v-border bg-surface hover:bg-surface-elevated text-text gap-1.5 rounded-xl cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} /> Upload Photo
                </Button>
              </>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            {/* Device Selector */}
            {devices.length > 1 && (
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const devId = e.target.value;
                    setSelectedDeviceId(devId);
                    if (isStreaming) {
                      stopCameraStream();
                      startCameraStream(devId);
                    }
                  }}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  {devices.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0"
                  strokeWidth={1.75}
                />
              </div>
            )}
          </div>

          {/* Scan Automation Preferences */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none hover:text-text leading-none">
              <input
                type="checkbox"
                checked={autoScan}
                onChange={(e) => setAutoScan(e.target.checked)}
                className="rounded border-v-border text-primary focus:ring-primary w-4 h-4 cursor-pointer accent-primary"
              />
              <span className="font-semibold text-text">Auto-Scan</span>
              <span className="text-[10px] text-text-muted font-mono">(1.4s)</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none hover:text-text leading-none">
              <input
                type="checkbox"
                checked={markAttendance}
                onChange={(e) => setMarkAttendance(e.target.checked)}
                className="rounded border-v-border text-primary focus:ring-primary w-4 h-4 cursor-pointer accent-primary"
              />
              <span className="font-semibold text-text">Record Attendance</span>
            </label>
          </div>
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-3.5 bg-danger-soft border border-danger/30 rounded-xl text-xs text-danger-text flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-danger" strokeWidth={1.75} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Enhanced Biometric Pipeline Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-surface border border-v-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
                <Scan className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary/25 whitespace-nowrap leading-none inline-flex items-center">
                Active
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-text leading-tight">Face Detection</h4>
              <p className="text-[11px] text-text-muted mt-1 leading-snug">
                Locates facial landmarks in real-time frame
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface border border-v-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-info-soft border border-info-text/25 flex items-center justify-center text-info-text shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-info-soft text-info-text border border-info-text/25 whitespace-nowrap leading-none inline-flex items-center">
                Quality
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-text leading-tight">Quality Check</h4>
              <p className="text-[11px] text-text-muted mt-1 leading-snug">
                Rejects blurry, dark or tilted face captures
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface border border-v-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
                <Layers className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary/25 whitespace-nowrap leading-none inline-flex items-center">
                Gallery
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-text leading-tight">Face Recognition</h4>
              <p className="text-[11px] text-text-muted mt-1 leading-snug">
                Cosine match against enrolled identities
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface border border-v-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-warning-soft border border-warning/25 flex items-center justify-center text-warning-text shrink-0">
                <Clock className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-warning-soft text-warning-text border border-warning/30 whitespace-nowrap leading-none inline-flex items-center">
                Cooldown
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-text leading-tight">Duplicate Guard</h4>
              <p className="text-[11px] text-text-muted mt-1 leading-snug">
                Prevents repeat logging within cooldown
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Right Panel: Live Feed & System Status Tabs (4 Columns) */}
      {/* ========================================================================= */}
      <div className="lg:col-span-4 space-y-4">
        <Card className="border-v-border bg-surface shadow-md flex flex-col rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-v-border space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex p-1 rounded-xl bg-bg-page border border-v-border">
                <button
                  onClick={() => setActiveSideTab("feed")}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer leading-none flex items-center justify-center ${
                    activeSideTab === "feed"
                      ? "bg-surface text-text shadow-xs"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Live Feed
                </button>
                <button
                  onClick={() => setActiveSideTab("processes")}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer leading-none flex items-center justify-center ${
                    activeSideTab === "processes"
                      ? "bg-surface text-text shadow-xs"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  System Status
                </button>
              </div>

              <Badge
                variant="outline"
                className="text-[10px] font-mono border-v-border text-text-muted px-2 py-0.5 whitespace-nowrap leading-none"
              >
                {activeSideTab === "feed"
                  ? `${recentScans.length} events`
                  : "8 Active"}
              </Badge>
            </div>
            <CardDescription className="t-small text-text-muted">
              {activeSideTab === "feed"
                ? "Real-time recognition results & attendance events"
                : "Active institutional biometric pipeline processes"}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-3.5 flex-1 overflow-y-auto max-h-[560px] space-y-2.5">
            {activeSideTab === "feed" ? (
              recentScans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-text-muted text-xs space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-bg-page border border-v-border flex items-center justify-center text-primary/60 shadow-inner">
                    <Scan className="w-6 h-6 animate-pulse" strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold t-body text-text">
                      No Scans Recorded Yet
                    </p>
                    <p className="t-small text-text-muted max-w-[220px] leading-relaxed">
                      Present face to the camera to record check-in or check-out attendance.
                    </p>
                  </div>
                </div>
              ) : (
                recentScans.map((scan) => {
                  const isMatch = scan.status === "match" || scan.score > 0.45;
                  const scorePct = Math.round(scan.score * 100);

                  return (
                    <div
                      key={scan.id}
                      className={`p-3 rounded-xl border transition-all duration-200 ${
                        scan.marked === "check_in"
                          ? "chip-success"
                          : scan.marked === "check_out"
                            ? "chip-warning"
                            : isMatch
                              ? "chip-neutral"
                              : "chip-danger"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            {isMatch ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                            ) : (
                              <UserX className="w-3.5 h-3.5 text-danger shrink-0" strokeWidth={1.75} />
                            )}
                            <span className="font-semibold text-xs text-text truncate leading-tight">
                              {scan.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono leading-none">
                            <span className="tabular-nums">
                              {scan.timestamp}
                            </span>
                            <span>•</span>
                            <span className="tabular-nums font-semibold">
                              {scorePct}% match
                            </span>
                          </div>
                        </div>

                        {scan.marked ? (
                          <span
                            className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 leading-none inline-flex items-center ${
                              scan.marked === "check_in"
                                ? "bg-primary-soft text-primary border-primary/40"
                                : "bg-warning-soft text-warning-text border-warning/40"
                            }`}
                          >
                            {scan.marked === "check_in"
                              ? "Check-In"
                              : "Check-Out"}
                          </span>
                        ) : (
                          <span
                            className={`text-[9px] font-mono font-medium uppercase px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 leading-none inline-flex items-center ${
                              isMatch
                                ? "bg-surface border-v-border text-text-muted"
                                : "bg-danger-soft text-danger-text border-danger/40"
                            }`}
                          >
                            {isMatch ? "Recognized" : "Unknown"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              // Live Status List of the 8 Standardized Processes
              <div className="space-y-2">
                {SYSTEM_PROCESSES.map((proc, index) => (
                  <div
                    key={index}
                    className="p-2.5 rounded-xl bg-surface border border-v-border flex items-start justify-between gap-2.5 hover:border-primary/30 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <h4 className="t-small font-semibold text-text truncate">
                          {proc.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-text-muted pl-3 leading-tight">
                        {proc.function}
                      </p>
                    </div>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-primary-soft text-primary border border-primary/20 shrink-0 font-semibold whitespace-nowrap">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
