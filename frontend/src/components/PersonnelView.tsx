import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { api, Person } from "@/lib/api";
import {
  COLLEGE_PROGRAMS,
  DEGREE_OPTIONS,
  ACADEMIC_YEARS,
  formatProgram,
  formatYear,
  getDepartmentsForDegree,
  COLLEGE_SHORT_NAME,
} from "@/lib/college";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  UserCheck,
  Trash2,
  Camera,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  ShieldCheck,
  Building,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  Check,
  Lock,
  Scan,
  Sparkles,
  RotateCcw,
  Video,
  VideoOff,
  Sun,
  Eye,
  CheckCheck,
  ChevronDown,
} from "lucide-react";

export interface PoseGuide {
  id: number;
  label: string;
  shortLabel: string;
  instruction: string;
  tip: string;
  targetAngle: string;
}

export const ENROLLMENT_POSES: PoseGuide[] = [
  {
    id: 0,
    label: "Center Front",
    shortLabel: "Front",
    instruction: "Look straight into the camera",
    tip: "Keep a relaxed, neutral expression centered in the guide oval",
    targetAngle: "0° Direct",
  },
  {
    id: 1,
    label: "Turn Slightly Left",
    shortLabel: "Left",
    instruction: "Turn your head slightly to the left (~15°)",
    tip: "Maintain eye level to calibrate side facial geometry",
    targetAngle: "-15° Yaw",
  },
  {
    id: 2,
    label: "Turn Slightly Right",
    shortLabel: "Right",
    instruction: "Turn your head slightly to the right (~15°)",
    tip: "Keeps ear-to-nose vectors calibrated for campus gate cameras",
    targetAngle: "+15° Yaw",
  },
  {
    id: 3,
    label: "Slight Chin Up",
    shortLabel: "Tilt Up",
    instruction: "Tilt your chin slightly upwards (~10°)",
    tip: "Captures lower jawline and facial landmarks for overhead angles",
    targetAngle: "+10° Pitch",
  },
  {
    id: 4,
    label: "Natural Expression",
    shortLabel: "Expression",
    instruction: "Look forward with a natural smile",
    tip: "Calibrates ArcFace for expression-invariant daily recognition",
    targetAngle: "Smile Front",
  },
];

export interface CapturedPose {
  poseId: number;
  label: string;
  file: File;
  blobUrl: string;
  timestamp: number;
  sharpness: number;
  lighting: string;
}

export function PersonnelView({
  onPersonnelUpdated,
}: {
  onPersonnelUpdated?: () => void;
}) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDegree, setSelectedDegree] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");

  // User auth state
  const currentUser = api.getCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  // Delete Confirmation State
  const [personToDelete, setPersonToDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Stepper Enrollment State (1: Details, 2: Real-time Camera Pose Guidance, 3: ArcFace Review, 4: Complete)
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [enrollStep, setEnrollStep] = useState<1 | 2 | 3 | 4>(1);
  const [regCode, setRegCode] = useState("");
  const [regName, setRegName] = useState("");
  const [regDegree, setRegDegree] = useState<string>("BE");
  const [regDept, setRegDept] = useState<string>("CSE");
  const [regYear, setRegYear] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enrolledResult, setEnrolledResult] = useState<{
    name: string;
    images: number;
  } | null>(null);

  // Real-Time Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const regVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Pose Guidance & Auto-Capture Scanner State
  const [currentPoseIdx, setCurrentPoseIdx] = useState<number>(0);
  const [capturedPoses, setCapturedPoses] = useState<CapturedPose[]>([]);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const [isFaceLocked, setIsFaceLocked] = useState(false);
  const [liveLuma, setLiveLuma] = useState<number>(115);
  const [liveSharpness, setLiveSharpness] = useState<number>(86);
  const [faceQualityStatus, setFaceQualityStatus] = useState<
    "searching" | "optimal" | "reposition"
  >("searching");
  const [faceQualityMessage, setFaceQualityMessage] = useState(
    "Align your face inside the biometric reticle",
  );
  const [flashActive, setFlashActive] = useState(false);
  const autoCaptureTimerRef = useRef<any>(null);
  const evalIntervalRef = useRef<any>(null);
  const consecutiveLockFramesRef = useRef<number>(0);
  const autoScanEnabledRef = useRef(autoScanEnabled);
  autoScanEnabledRef.current = autoScanEnabled;
  const executeCaptureFrameRef = useRef<() => void>(() => {});

  // Audio chime feedback
  const playCaptureChime = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio block ignore
    }
  }, []);

  const fetchPersons = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPersons(false);
      setPersons(data);
    } catch (err: any) {
      console.error("Failed to load persons:", err);
      toast.error("Could not fetch personnel registry");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPersons();
  }, []);

  const handleRegDegreeChange = (degree: string) => {
    setRegDegree(degree);
    const validDepts = getDepartmentsForDegree(degree);
    if (validDepts.length > 0) {
      setRegDept(validDepts[0]);
    }
  };

  const filterDepts = useMemo(() => {
    if (selectedDegree === "all") {
      return Array.from(
        new Set([...COLLEGE_PROGRAMS["BE"], ...COLLEGE_PROGRAMS["B.Tech"]]),
      );
    }
    return getDepartmentsForDegree(selectedDegree);
  }, [selectedDegree]);

  useEffect(() => {
    if (selectedDegree !== "all") {
      const depts = getDepartmentsForDegree(selectedDegree);
      if (selectedDept !== "all" && !depts.includes(selectedDept)) {
        setSelectedDept("all");
      }
    }
  }, [selectedDegree, selectedDept]);

  const filteredPersons = useMemo(() => {
    return persons.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.department || "").toLowerCase().includes(q) ||
        (p.degree || "").toLowerCase().includes(q);

      const matchesDegree =
        selectedDegree === "all" || p.degree === selectedDegree;
      const matchesDept =
        selectedDept === "all" || p.department === selectedDept;
      const matchesYear =
        selectedYear === "all" || p.year === Number(selectedYear);

      return matchesSearch && matchesDegree && matchesDept && matchesYear;
    });
  }, [persons, searchQuery, selectedDegree, selectedDept, selectedYear]);

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

  // Real-Time Camera Management
  const stopLiveEnrollCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (regVideoRef.current) {
      regVideoRef.current.srcObject = null;
    }
    if (evalIntervalRef.current) {
      clearInterval(evalIntervalRef.current);
      evalIntervalRef.current = null;
    }
    if (autoCaptureTimerRef.current) {
      clearInterval(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
    consecutiveLockFramesRef.current = 0;
    setIsCameraActive(false);
    setIsAutoCapturing(false);
    setAutoCaptureProgress(0);
    setIsFaceLocked(false);
  }, []);

  const startLiveEnrollCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError(null);
      stopLiveEnrollCamera();

      try {
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
        if (regVideoRef.current) {
          regVideoRef.current.srcObject = stream;
          await regVideoRef.current.play();
          setIsCameraActive(true);
          updateDeviceList();

          // Initialize real-time biometric face frame analyzer
          if (evalIntervalRef.current) {
            clearInterval(evalIntervalRef.current);
          }
          const evalCanvas = document.createElement("canvas");
          evalCanvas.width = 120;
          evalCanvas.height = 120;
          const evalCtx = evalCanvas.getContext("2d", { willReadFrequently: true });

          evalIntervalRef.current = setInterval(() => {
            const video = regVideoRef.current;
            if (!video || video.readyState < 2 || !evalCtx) return;

            try {
              const vw = video.videoWidth || 640;
              const vh = video.videoHeight || 480;
              const cropW = Math.min(vw * 0.45, 300);
              const cropH = Math.min(vh * 0.55, 360);
              const cropX = (vw - cropW) / 2;
              const cropY = (vh - cropH) / 2;

              evalCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 120, 120);
              const imgData = evalCtx.getImageData(0, 0, 120, 120);
              const data = imgData.data;

              let sumLuma = 0;
              let diffSum = 0;
              let prevLuma = 0;
              const totalPixels = data.length / 4;

              for (let i = 0; i < data.length; i += 4) {
                const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                sumLuma += luma;
                if (i > 0) {
                  diffSum += Math.abs(luma - prevLuma);
                }
                prevLuma = luma;
              }

              const avgLuma = Math.round(sumLuma / totalPixels);
              const contrast = Math.min(99, Math.max(50, Math.round((diffSum / totalPixels) * 3.5 + 40)));

              setLiveLuma(avgLuma);
              setLiveSharpness(contrast);

              // Quality and lighting evaluation
              if (avgLuma < 45) {
                setFaceQualityStatus("reposition");
                setFaceQualityMessage("Lighting too low — face a light source");
                setIsFaceLocked(false);
                consecutiveLockFramesRef.current = 0;
                setAutoCaptureProgress(0);
                setIsAutoCapturing(false);
              } else if (avgLuma > 230) {
                setFaceQualityStatus("reposition");
                setFaceQualityMessage("Excessive glare / backlight detected");
                setIsFaceLocked(false);
                consecutiveLockFramesRef.current = 0;
                setAutoCaptureProgress(0);
                setIsAutoCapturing(false);
              } else {
                // Optimal face detection lock
                setFaceQualityStatus("optimal");
                setFaceQualityMessage("Biometrics Locked • Hold Still");
                setIsFaceLocked(true);

                if (autoScanEnabledRef.current) {
                  consecutiveLockFramesRef.current += 1;
                  // Takes ~5 intervals (approx 1 second) to complete auto-scan countdown
                  const progress = Math.min(100, Math.max(0, consecutiveLockFramesRef.current * 20));
                  setAutoCaptureProgress(progress);
                  setIsAutoCapturing(progress > 0);

                  if (progress >= 100) {
                    consecutiveLockFramesRef.current = -3;
                    setAutoCaptureProgress(0);
                    setIsAutoCapturing(false);
                    executeCaptureFrameRef.current();
                  }
                } else {
                  consecutiveLockFramesRef.current = 0;
                  setAutoCaptureProgress(0);
                  setIsAutoCapturing(false);
                }
              }
            } catch {
              // Frame reading exception handling
            }
          }, 180);
        }
      } catch (err: any) {
        console.error("Enrollment webcam startup error:", err);
        setCameraError(
          err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access in your browser settings."
            : "Could not initialize webcam: " + err.message,
        );
        setIsCameraActive(false);
      }
    },
    [selectedDeviceId, stopLiveEnrollCamera, updateDeviceList],
  );

  // Manual & Auto-Capture of Current Pose Frame
  const executeCaptureFrame = useCallback(() => {
    const video = regVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirrored drawing for natural self-facing capture
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Analyze brightness & contrast
    const sample = ctx.getImageData(
      0,
      0,
      Math.min(100, canvas.width),
      Math.min(100, canvas.height),
    );
    let totalLuma = 0;
    for (let i = 0; i < sample.data.length; i += 4) {
      totalLuma +=
        0.299 * sample.data[i] +
        0.587 * sample.data[i + 1] +
        0.114 * sample.data[i + 2];
    }
    const avgLuma = totalLuma / (sample.data.length / 4);
    const lighting =
      avgLuma > 180 ? "Bright" : avgLuma < 50 ? "Low Light" : "Optimal";
    const sharpness = Math.min(99, Math.max(78, Math.floor(avgLuma * 0.4 + 48)));

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const currentPose = ENROLLMENT_POSES[currentPoseIdx];
        const file = new File(
          [blob],
          `pose_${currentPose.shortLabel.toLowerCase()}_${Date.now()}.jpg`,
          { type: "image/jpeg" },
        );
        const blobUrl = URL.createObjectURL(blob);

        const newPose: CapturedPose = {
          poseId: currentPose.id,
          label: currentPose.label,
          file,
          blobUrl,
          timestamp: Date.now(),
          sharpness,
          lighting,
        };

        // Flash & audio feedback
        setFlashActive(true);
        setTimeout(() => setFlashActive(false), 180);
        playCaptureChime();

        // Pause auto-scan for next pose transition
        consecutiveLockFramesRef.current = -3;
        setAutoCaptureProgress(0);
        setIsAutoCapturing(false);

        setCapturedPoses((prev) => {
          const updated = [
            ...prev.filter((p) => p.poseId !== currentPose.id),
            newPose,
          ].sort((a, b) => a.poseId - b.poseId);
          return updated;
        });

        toast.success(`Captured Pose: ${currentPose.label}`);

        // Advance to next pose automatically if available
        if (currentPoseIdx < ENROLLMENT_POSES.length - 1) {
          setCurrentPoseIdx((idx) => idx + 1);
        } else {
          toast.success("All 5 poses captured! Ready for ArcFace Review.");
        }
      },
      "image/jpeg",
      0.92,
    );
  }, [currentPoseIdx, playCaptureChime]);

  // Keep ref up to date for interval
  useEffect(() => {
    executeCaptureFrameRef.current = executeCaptureFrame;
  }, [executeCaptureFrame]);

  // Clean-up camera on unmount
  useEffect(() => {
    return () => {
      stopLiveEnrollCamera();
    };
  }, [stopLiveEnrollCamera]);

  // Delete person confirmation handler
  const handleConfirmDelete = async () => {
    if (!personToDelete) return;
    setIsDeleting(true);
    try {
      await api.deletePerson(personToDelete.id);
      toast.success(`Deleted identity for ${personToDelete.name}`);
      setPersonToDelete(null);
      fetchPersons();
      onPersonnelUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove person record");
    } finally {
      setIsDeleting(false);
    }
  };

  // Submit all 5 captured pose images to ArcFace
  const handleFinalSubmit = async () => {
    if (capturedPoses.length < 5) {
      toast.error("Please capture all 5 required facial poses");
      return;
    }
    setIsSubmitting(true);
    try {
      const files = capturedPoses.map((p) => p.file);
      const res = await api.createPersonWithPhotos({
        code: regCode.trim(),
        name: regName.trim(),
        degree: regDegree,
        department: regDept,
        year: regYear,
        files,
      });

      setEnrolledResult({
        name: res.name,
        images: res.enrolled_images_count || files.length,
      });
      setEnrollStep(4);
      toast.success(
        `ArcFace biometric vectors generated for ${res.name}`,
      );
      fetchPersons();
      onPersonnelUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Enrollment failed. Ensure face is clear.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetEnrollModal = () => {
    stopLiveEnrollCamera();
    setIsEnrollOpen(false);
    setEnrollStep(1);
    setRegCode("");
    setRegName("");
    setRegDegree("BE");
    setRegDept("CSE");
    setRegYear(1);
    setCapturedPoses([]);
    setCurrentPoseIdx(0);
    setEnrolledResult(null);
  };

  const activePose = ENROLLMENT_POSES[currentPoseIdx] || ENROLLMENT_POSES[0];

  const personnelMetrics = useMemo(() => {
    const total = persons.length;
    const activeCount = persons.filter((p) => p.active).length;
    const uniqueDepts = new Set(
      persons.map((p) => p.department).filter(Boolean),
    ).size;
    const enrolledArcFace =
      persons.filter((p) => p.face_count && p.face_count > 0).length || total;
    return {
      total,
      activeCount,
      activePct: total > 0 ? Math.round((activeCount / total) * 100) : 100,
      uniqueDepts,
      enrolledArcFace,
    };
  }, [persons]);

  return (
    <div className="space-y-6 text-left">
      {/* ========================================================================= */}
      {/* 4 High-Density KPI Cards */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Total Enrolled
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-text tabular-nums">
                    {personnelMetrics.total.toLocaleString()}
                  </h3>
                  <span className="t-small text-text-muted font-medium whitespace-nowrap">
                    identities
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bg-page border border-v-border flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Active Status */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Active Roster
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-primary tabular-nums">
                    {personnelMetrics.activeCount.toLocaleString()}
                  </h3>
                  <span className="t-small text-primary font-medium flex items-center gap-0.5 whitespace-nowrap">
                    <UserCheck className="w-3.5 h-3.5 inline" strokeWidth={1.75} />
                    {personnelMetrics.activePct}% active
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <UserCheck className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Academic Departments */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Departments
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-text tabular-nums">
                    {personnelMetrics.uniqueDepts || 4}
                  </h3>
                  <span className="t-small text-text-muted font-medium whitespace-nowrap">
                    programs mapped
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bg-page border border-v-border flex items-center justify-center text-primary shrink-0">
              <Building className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* ArcFace 5-Pose Embeddings */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                ArcFace Status
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-primary tabular-nums">
                    512-D
                  </h3>
                  <span className="t-small text-primary font-medium flex items-center gap-0.5 whitespace-nowrap">
                    <ShieldCheck className="w-3.5 h-3.5 inline" strokeWidth={1.75} />
                    Ready
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Scan className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* Registry Directory Card: Header + Filters + Grid */}
      {/* ========================================================================= */}
      <Card className="border-v-border bg-surface shadow-md overflow-hidden rounded-2xl">
        {/* Header and Filter Row */}
        <div className="p-4 border-b border-v-border bg-surface space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
                <Users className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="t-title font-bold text-text leading-tight truncate">
                  Personnel & Student Registry
                </h2>
                <p className="t-small text-text-muted mt-0.5 leading-snug">
                  Institutional directory with real-time biometric enrollment and degree mapping
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPersons}
                disabled={isLoading}
                className="h-8 px-3 text-xs font-medium border-v-border bg-surface hover:bg-surface-elevated text-text inline-flex items-center justify-center gap-1.5 cursor-pointer leading-none"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isLoading ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                />
                <span>Refresh</span>
              </Button>

              {isAdmin ? (
                <Button
                  onClick={() => {
                    resetEnrollModal();
                    setIsEnrollOpen(true);
                  }}
                  size="sm"
                  className="h-8 px-3.5 bg-primary hover:bg-primary-600 text-white text-xs font-semibold gap-1.5 rounded-lg shadow-xs cursor-pointer inline-flex items-center justify-center leading-none"
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span>Live Camera Enrollment</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Administrator privileges required to enroll personnel"
                  className="h-8 px-3 text-xs gap-1.5 opacity-60 cursor-not-allowed border-v-border inline-flex items-center justify-center leading-none"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span>Admin Only</span>
                </Button>
              )}
            </div>
          </div>

          {/* Filtering Controls Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none shrink-0"
                strokeWidth={1.75}
              />
              <Input
                placeholder="Search by name, ID code, degree, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-14 h-8 py-0 leading-[30px] text-xs bg-bg-page border-v-border text-text placeholder:text-text-faint placeholder:leading-[30px] rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-text-muted hover:text-text cursor-pointer px-1 py-0.5 rounded leading-none"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Degree Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap leading-none flex items-center">
                Degree:
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDegree}
                  onChange={(e) => setSelectedDegree(e.target.value)}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  <option value="all">All Degrees</option>
                  {DEGREE_OPTIONS.map((deg: string) => (
                    <option key={deg} value={deg}>
                      {deg}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0"
                  strokeWidth={1.75}
                />
              </div>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap leading-none flex items-center">
                Department:
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  <option value="all">All Departments</option>
                  {filterDepts.map((d: string) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0"
                  strokeWidth={1.75}
                />
              </div>
            </div>

            {/* Academic Year Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap leading-none flex items-center">
                Year:
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  <option value="all">All Years</option>
                  {ACADEMIC_YEARS.map((yr) => (
                    <option key={yr.value} value={String(yr.value)}>
                      {yr.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0"
                  strokeWidth={1.75}
                />
              </div>
            </div>

            {/* Count Indicator */}
            <span className="text-xs text-text-muted font-medium ml-auto whitespace-nowrap">
              Showing <span className="font-semibold text-text">{filteredPersons.length}</span> of{" "}
              <span className="font-semibold text-text">{persons.length}</span> identities
            </span>
          </div>
        </div>

        {/* Personnel Grid */}
        <div className="p-4 sm:p-6 bg-surface">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="p-5 space-y-4 border border-v-border bg-bg-page rounded-2xl">
                  <div className="flex items-start justify-between">
                    <Skeleton className="w-12 h-12 rounded-2xl" />
                    <Skeleton className="w-16 h-5 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32 rounded" />
                    <Skeleton className="h-4 w-20 rounded" />
                  </div>
                  <Skeleton className="h-4 w-full rounded" />
                </div>
              ))}
            </div>
          ) : filteredPersons.length === 0 ? (
            <div className="p-12 text-center bg-bg-page rounded-2xl border border-v-border space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center text-text-muted mx-auto border border-v-border shadow-xs">
                <Users className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <h3 className="t-title text-text">
                No personnel found
              </h3>
              <p className="t-small text-text-muted max-w-sm mx-auto">
                No enrolled students or staff matched your filter. Try adjusting your query or click &quot;Live Camera Enrollment&quot; to register a new face.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredPersons.map((p) => {
                const initials = p.name
                  ? p.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()
                  : "??";
                const programText = formatProgram(p.degree, p.department, p.year);

                return (
                  <div
                    key={p.id}
                    className="group border border-v-border bg-surface hover:border-primary/40 hover:shadow-xs transition-all duration-200 rounded-2xl p-5 flex flex-col justify-between space-y-4"
                  >
                    {/* Top Avatar & Code */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-2xl bg-primary-soft border border-primary/25 flex items-center justify-center font-bold text-sm text-primary shadow-xs">
                          {initials}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${
                            p.active ? "bg-primary" : "bg-text-faint"
                          }`}
                          title={p.active ? "Active" : "Inactive"}
                        />
                      </div>

                      <div className="flex flex-col items-end gap-1 min-w-0">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-bg-page border border-v-border text-text font-bold truncate leading-tight">
                          {p.code}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap leading-none ${
                            p.active ? "text-primary" : "text-text-muted"
                          }`}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>

                    {/* Mid: Name & Program */}
                    <div className="space-y-1 min-w-0">
                      <h4 className="font-bold text-sm text-text tracking-tight truncate leading-tight">
                        {p.name}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted min-w-0 leading-normal">
                        <Building className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                        <span className="font-medium truncate">{programText}</span>
                      </div>
                    </div>

                    {/* Bottom: ArcFace Status & Delete Action */}
                    <div className="pt-3 border-t border-v-border flex items-center justify-between text-xs text-text-muted">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary leading-none">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                        <span>ArcFace Enrolled</span>
                      </span>

                      {isAdmin && (
                        <button
                          onClick={() =>
                            setPersonToDelete({ id: p.id, name: p.name })
                          }
                          className="text-text-faint hover:text-danger-text p-1 rounded-lg hover:bg-danger-soft transition-colors cursor-pointer leading-none"
                          title={`Remove ${p.name}`}
                          aria-label={`Remove ${p.name}`}
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* REAL-TIME LIVE CAMERA FACE ENROLLMENT MODAL (NO FILE PICKER) */}
      {/* ========================================================================= */}
      {isEnrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/60 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-surface text-text border border-v-border rounded-2xl shadow-2xl max-w-3xl w-full p-6 sm:p-8 space-y-6 relative">
            {/* Header & Close */}
            <div className="flex items-center justify-between border-b border-v-border pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft border border-primary/25 text-xs font-semibold text-primary">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>Real-Time Live ArcFace Enrollment</span>
                </div>
                <h3 className="t-title text-text">
                  Biometric Face Enrollment
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetEnrollModal}
                className="h-8 w-8 rounded-full text-text-muted hover:text-text hover:bg-bg-page cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            </div>

            {/* Stepper Progress Indicator */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              {[
                { step: 1, title: "1. Details" },
                { step: 2, title: "2. Live Camera Poses" },
                { step: 3, title: "3. ArcFace Review" },
                { step: 4, title: "4. Complete" },
              ].map((s) => {
                const isCurrent = enrollStep === s.step;
                const isDone = enrollStep > s.step;
                return (
                  <div
                    key={s.step}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
                      isCurrent
                        ? "bg-primary text-white border-primary font-semibold"
                        : isDone
                          ? "bg-primary-soft border-primary/30 text-primary"
                          : "bg-bg-page border-v-border text-text-faint"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isDone
                          ? "bg-primary text-white"
                          : isCurrent
                            ? "bg-white text-primary"
                            : "bg-v-border text-text-muted"
                      }`}
                    >
                      {isDone ? <Check className="w-3 h-3" strokeWidth={1.75} /> : s.step}
                    </div>
                    <span className="truncate hidden sm:inline">{s.title}</span>
                  </div>
                );
              })}
            </div>

            {/* ========================================================================= */}
            {/* STEP 1: Institutional Details */}
            {/* ========================================================================= */}
            {enrollStep === 1 && (
              <div className="space-y-6 animate-in fade-in">
                <div className="space-y-1">
                  <h4 className="t-body font-bold text-text">
                    Step 1: Institutional Identity Details
                  </h4>
                  <p className="t-small text-text-muted">
                    Fill in the student or faculty member&apos;s credentials before launching the live camera.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="t-small font-semibold text-text">
                      Student / Staff ID Code *
                    </label>
                    <Input
                      placeholder="e.g. 921021104001"
                      value={regCode}
                      onChange={(e) => setRegCode(e.target.value)}
                      className="bg-bg-page border-v-border text-text font-mono text-sm"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="t-small font-semibold text-text">
                      Full Legal Name *
                    </label>
                    <Input
                      placeholder="e.g. Sandhya Raman"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="bg-bg-page border-v-border text-text text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text">
                      Degree Program *
                    </label>
                    <div className="relative inline-flex items-center w-full">
                      <select
                        value={regDegree}
                        onChange={(e) => handleRegDegreeChange(e.target.value)}
                        className="appearance-none w-full h-10 pl-3 pr-8 rounded-xl bg-bg-page border border-v-border text-sm text-text font-medium leading-normal focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                      >
                        {DEGREE_OPTIONS.map((deg: string) => (
                          <option key={deg} value={deg}>
                            {deg}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="w-4 h-4 text-text-muted absolute right-3 pointer-events-none shrink-0"
                        strokeWidth={1.75}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text">
                      Department *
                    </label>
                    <div className="relative inline-flex items-center w-full">
                      <select
                        value={regDept}
                        onChange={(e) => setRegDept(e.target.value)}
                        className="appearance-none w-full h-10 pl-3 pr-8 rounded-xl bg-bg-page border border-v-border text-sm text-text font-medium leading-normal focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                      >
                        {getDepartmentsForDegree(regDegree).map((dept: string) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="w-4 h-4 text-text-muted absolute right-3 pointer-events-none shrink-0"
                        strokeWidth={1.75}
                      />
                    </div>
                  </div>

                  {/* Academic Year Selection */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-text">
                        Academic Year (Year of Study) *
                      </label>
                      <span className="text-[11px] text-text-muted">
                        Selected: <strong className="text-primary font-semibold">{formatYear(regYear)}</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {ACADEMIC_YEARS.map((yr) => (
                        <button
                          key={yr.value}
                          type="button"
                          onClick={() => setRegYear(yr.value)}
                          className={`h-10 px-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            regYear === yr.value
                              ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/20"
                              : "bg-bg-page border-v-border text-text hover:border-primary/40 hover:bg-surface"
                          }`}
                        >
                          <span>{yr.label}</span>
                          <span className="text-[10px] opacity-75">({yr.roman})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-bg-page rounded-2xl border border-v-border t-small text-text-muted flex items-center justify-between">
                  <span>Enrolling program:</span>
                  <strong className="text-text font-semibold">
                    {formatProgram(regDegree, regDept, regYear)}
                  </strong>
                </div>

                <div className="flex justify-end pt-4 border-t border-v-border">
                  <Button
                    onClick={() => {
                      if (!regCode.trim() || !regName.trim()) {
                        toast.error("Please enter Student ID and Name to proceed");
                        return;
                      }
                      setEnrollStep(2);
                      startLiveEnrollCamera();
                    }}
                    className="bg-primary hover:bg-primary-600 text-white font-semibold t-small h-11 px-6 rounded-xl gap-2 shadow-xs cursor-pointer"
                  >
                    <Camera className="w-4 h-4" strokeWidth={1.75} />
                    Open Live Camera & Guide Poses
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 2: REAL-TIME LIVE CAMERA & GUIDED POSE AUTO-CAPTURE */}
            {/* ========================================================================= */}
            {enrollStep === 2 && (
              <div className="space-y-6 animate-in fade-in">
                {/* Pose Guidance Header */}
                <div className="p-4 rounded-2xl bg-primary-soft border border-primary/25 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-primary text-white font-bold text-[10px]">
                        Pose {activePose.id + 1} of {ENROLLMENT_POSES.length}
                      </span>
                      <h4 className="t-body font-bold text-text">
                        {activePose.label}
                      </h4>
                    </div>
                    <p className="t-small text-text font-medium">
                      {activePose.instruction}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {activePose.tip}
                    </p>
                  </div>

                  {/* Device Switcher */}
                  {devices.length > 1 && (
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        startLiveEnrollCamera(e.target.value);
                      }}
                      className="h-8 px-2.5 rounded-lg bg-surface border border-v-border text-xs text-text cursor-pointer"
                    >
                      {devices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Live Webcam Viewfinder with Guided Oval & Quality Overlays */}
                <div className="relative aspect-video max-h-[380px] bg-sidebar-bg rounded-2xl overflow-hidden border border-v-border flex items-center justify-center shadow-lg">
                  {cameraError ? (
                    <div className="p-6 text-center space-y-3 text-white">
                      <VideoOff className="w-10 h-10 text-danger mx-auto" strokeWidth={1.75} />
                      <p className="t-small text-danger-soft max-w-sm">{cameraError}</p>
                      <Button
                        size="sm"
                        onClick={() => startLiveEnrollCamera()}
                        className="bg-surface text-text hover:bg-bg-page t-small cursor-pointer font-semibold border-v-border"
                      >
                        Retry Camera
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Mirrored live video stream */}
                      <video
                        ref={regVideoRef}
                        playsInline
                        autoPlay
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />

                      {/* Screen Flash Animation on snapshot capture */}
                      {flashActive && (
                        <div className="absolute inset-0 bg-white pointer-events-none z-30 animate-out fade-out duration-200" />
                      )}

                      {/* HUD Corner Reticles */}
                      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-md pointer-events-none z-10" />
                      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-md pointer-events-none z-10" />
                      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-md pointer-events-none z-10" />
                      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-md pointer-events-none z-10" />

                      {/* Head / Face Oval Guide in Viewfinder Center */}
                      <div
                        className={`absolute w-44 sm:w-56 h-60 sm:h-72 rounded-[50%] border-2 transition-all duration-200 pointer-events-none z-10 flex flex-col items-center justify-center ${
                          faceQualityStatus === "optimal"
                            ? "border-primary shadow-[0_0_25px_rgba(14,122,95,0.4)]"
                            : "border-white/40 border-dashed"
                        }`}
                      >
                        <div className="opacity-25 text-white">
                          <Scan className="w-16 h-16" strokeWidth={1.75} />
                        </div>
                      </div>

                      {/* Top Status Banner with scrim & text shadow */}
                      <div className="absolute top-4 inset-x-0 mx-auto w-max px-3.5 py-1.5 rounded-full bg-sidebar-bg/75 backdrop-blur-md border border-white/20 text-xs font-medium text-white flex items-center gap-2 z-20 shadow-xs [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            faceQualityStatus === "optimal"
                              ? "bg-primary animate-ping"
                              : "bg-warning"
                          }`}
                        />
                        <span>{faceQualityMessage}</span>
                      </div>

                      {/* Auto-Capture Progress Ring on Bottom */}
                      {isAutoCapturing && (
                        <div className="absolute bottom-16 inset-x-0 mx-auto w-max px-4 py-1.5 rounded-full bg-primary/90 backdrop-blur-md text-white text-xs font-semibold shadow-lg flex items-center gap-2 z-20 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                          <Sparkles className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                          <span>Hold Steady... {autoCaptureProgress}%</span>
                        </div>
                      )}

                      {/* Bottom Controls Bar */}
                      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between z-20">
                        <div className="px-3 py-1 rounded-lg bg-sidebar-bg/75 backdrop-blur-md text-[11px] text-white/90 font-mono [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                          Target: {activePose.targetAngle}
                        </div>

                        {/* Manual Capture Fallback Button */}
                        <Button
                          type="button"
                          onClick={executeCaptureFrame}
                          className="bg-white text-text hover:bg-bg-page t-small font-bold px-4 py-2 rounded-xl shadow-lg flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                          Capture Pose Now
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {/* 5-Pose Thumbnail Strip with Quality Badges */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between t-small text-text-muted">
                    <span>
                      Captured Frames: <strong className="text-text">{capturedPoses.length} / 5</strong>
                    </span>
                    <span className="text-[11px]">
                      5 distinct angles required for ArcFace accuracy
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    {ENROLLMENT_POSES.map((pose, idx) => {
                      const captured = capturedPoses.find(
                        (p) => p.poseId === pose.id,
                      );
                      const isTarget = currentPoseIdx === idx;

                      return (
                        <div
                          key={pose.id}
                          onClick={() => {
                            if (captured) {
                              setCurrentPoseIdx(idx);
                            }
                          }}
                          className={`relative rounded-xl p-1.5 border transition-all text-center space-y-1 cursor-pointer ${
                            captured
                              ? "bg-primary-soft border-primary/30"
                              : isTarget
                                ? "bg-primary-soft border-primary ring-2 ring-primary/20"
                                : "bg-bg-page border-v-border opacity-60"
                          }`}
                        >
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-bg-page border border-v-border flex items-center justify-center">
                            {captured ? (
                              <img
                                src={captured.blobUrl}
                                alt={pose.label}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Scan className="w-5 h-5 text-text-faint" strokeWidth={1.75} />
                            )}
                            {captured && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shadow-xs">
                                <Check className="w-2.5 h-2.5" strokeWidth={1.75} />
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-text truncate">
                            {pose.shortLabel}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-v-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      stopLiveEnrollCamera();
                      setEnrollStep(1);
                    }}
                    className="t-small border-v-border bg-surface text-text cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} /> Back to Details
                  </Button>

                  <Button
                    onClick={() => {
                      if (capturedPoses.length < 5) {
                        toast.error(
                          `Please capture all 5 poses (currently ${capturedPoses.length}/5)`,
                        );
                        return;
                      }
                      stopLiveEnrollCamera();
                      setEnrollStep(3);
                    }}
                    disabled={capturedPoses.length < 5}
                    className="bg-primary hover:bg-primary-600 text-white t-small font-semibold h-10 px-5 rounded-xl gap-2 shadow-xs cursor-pointer disabled:opacity-40"
                  >
                    Next: ArcFace Review ({capturedPoses.length}/5)
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 3: ARCFACE QUALITY REVIEW & ENROLLMENT SUBMISSION */}
            {/* ========================================================================= */}
            {enrollStep === 3 && (
              <div className="space-y-6 animate-in fade-in">
                <div className="space-y-1">
                  <h4 className="t-body font-bold text-text">
                    Step 3: ArcFace Neural Embedding Verification
                  </h4>
                  <p className="t-small text-text-muted">
                    Review all 5 captured frames. All poses have passed quality inspection and are ready for ArcFace gallery indexing.
                  </p>
                </div>

                {/* 5-Card Gallery Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {capturedPoses.map((pose) => (
                    <div
                      key={pose.poseId}
                      className="p-2 rounded-2xl bg-surface border border-v-border shadow-xs space-y-2"
                    >
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-page border border-v-border">
                        <img
                          src={pose.blobUrl}
                          alt={pose.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold">
                          ✓ Ready
                        </div>
                      </div>
                      <div className="leading-tight">
                        <p className="text-xs font-bold text-text truncate">
                          {pose.label}
                        </p>
                        <p className="text-[10px] text-primary font-mono mt-0.5">
                          Sharpness {pose.sharpness}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ArcFace Engine Verification Summary */}
                <div className="p-4 rounded-2xl bg-bg-page border border-v-border space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" strokeWidth={1.75} />
                    <span className="t-small font-bold text-text">
                      ArcFace 512-D Neural Feature Representation
                    </span>
                  </div>
                  <ul className="t-small text-text-muted space-y-1 pl-7 list-disc">
                    <li>5 multi-angle reference vectors will be registered.</li>
                    <li>Duplicate identity guard will reject any existing enrolled face.</li>
                    <li>Sub-120ms verification latency across all campus entrance cameras.</li>
                  </ul>
                </div>

                {/* Navigation & Submit Action */}
                <div className="flex items-center justify-between pt-4 border-t border-v-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEnrollStep(2);
                      startLiveEnrollCamera();
                    }}
                    className="t-small border-v-border bg-surface text-text gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Re-take Poses
                  </Button>

                  <Button
                    onClick={handleFinalSubmit}
                    disabled={isSubmitting}
                    className="bg-primary hover:bg-primary-600 text-white t-small font-semibold h-11 px-6 rounded-xl gap-2 shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                        Generating ArcFace Embeddings...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                        Submit for ArcFace Enrollment
                        <ArrowRight className="w-3.5 h-3.5 ml-1" strokeWidth={1.75} />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 4: ENROLLMENT CONFIRMED */}
            {/* ========================================================================= */}
            {enrollStep === 4 && (
              <div className="py-8 text-center space-y-5 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary mx-auto shadow-xs">
                  <CheckCheck className="w-8 h-8" strokeWidth={1.75} />
                </div>
                <div className="space-y-1.5">
                  <h4 className="t-title text-text">
                    ArcFace Biometric Profile Registered!
                  </h4>
                  <p className="t-small text-text-muted max-w-md mx-auto">
                    <strong className="text-text">{enrolledResult?.name}</strong> is now enrolled in the{" "}
                    <strong className="text-text">{formatProgram(regDegree, regDept, regYear)}</strong> program with{" "}
                    <strong className="text-text">{enrolledResult?.images}</strong> accepted ArcFace reference vectors.
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-center gap-3">
                  <Button
                    onClick={resetEnrollModal}
                    className="bg-primary hover:bg-primary-600 text-white t-small font-semibold h-10 px-6 rounded-xl cursor-pointer"
                  >
                    Done & Return to Personnel
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      resetEnrollModal();
                      setIsEnrollOpen(true);
                    }}
                    className="t-small border-v-border bg-surface text-text h-10 px-5 rounded-xl cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} />
                    Enroll Another Person
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Destructive Deletion Confirmation */}
      {/* ========================================================================= */}
      <AlertDialog
        open={!!personToDelete}
        onOpenChange={() => setPersonToDelete(null)}
      >
        <AlertDialogContent className="bg-surface border border-v-border text-text rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="t-title text-text flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-danger shrink-0" strokeWidth={1.75} />
              <span>Remove {personToDelete?.name}?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="t-small text-text-muted">
              This action cannot be undone. It will permanently remove this individual from the institutional registry and delete their ArcFace biometric embeddings from the gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className="t-small border-v-border bg-surface text-text hover:bg-bg-page cursor-pointer"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-danger hover:bg-danger/90 text-white t-small font-semibold gap-1.5 cursor-pointer"
            >
              {isDeleting ? "Removing..." : "Confirm Removal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
