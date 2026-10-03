import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  SlidersHorizontal,
  Clock,
  Video,
  Database,
  ShieldCheck,
  RotateCcw,
  Save,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  KeyRound,
  Sparkles,
  Info,
  CheckCircle2,
  Camera,
  Activity,
  Layers,
  ArrowRight,
  UserCheck,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, getKioskToken, setKioskToken, HealthStatus, UserInfo } from "@/lib/api";

type Cam = { id: string; name: string; url: string; mode: string };
type State = { v: Record<string, number | string>; cams: Cam[] };

type F = {
  k: string;
  label: string;
  help: string;
  kind: "range" | "number" | "text" | "select";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  rec?: [number, number];
  warn?: [string, string];
  opts?: string[];
};

const DEFAULTS: State["v"] = {
  match_threshold: 0.45,
  duplicate_threshold: 0.65,
  confirm_frames: 3,
  attendance_cooldown_s: 300,
  min_checkout_gap_min: 60,
  late_cutoff: "09:15",
  default_mode: "auto",
};

const SECTIONS: {
  id: string;
  title: string;
  blurb: string;
  icon: React.ElementType;
  fields?: F[];
}[] = [
  {
    id: "recognition",
    title: "Recognition Strictness",
    blurb: "Tune mathematical cosine similarity thresholds for ArcFace 512-D identity matching.",
    icon: SlidersHorizontal,
    fields: [
      {
        k: "match_threshold",
        label: "Match strictness threshold",
        kind: "range",
        min: 0.3,
        max: 0.7,
        step: 0.01,
        rec: [0.42, 0.52],
        help: "Cosine similarity required to authenticate a student. Higher means fewer false positives, but requires better lighting.",
        warn: [
          "Low threshold: Different students might mistakenly match as the same identity.",
          "High threshold: Enrolled students may fail verification in low ambient lighting.",
        ],
      },
      {
        k: "duplicate_threshold",
        label: "Duplicate enrollment boundary",
        kind: "range",
        min: 0.5,
        max: 0.8,
        step: 0.01,
        rec: [0.6, 0.7],
        help: "Prevents the same student face from being enrolled twice under duplicate register numbers.",
        warn: [
          "Low limit: Legitimate new students might be falsely flagged as existing duplicates.",
          "High limit: Accidental duplicate registrations could bypass safety checks.",
        ],
      },
      {
        k: "confirm_frames",
        label: "Sequential confirm frames",
        kind: "number",
        min: 1,
        max: 10,
        unit: "frames",
        help: "Number of consecutive video frames the face vector must match before attendance is confirmed.",
      },
    ],
  },
  {
    id: "attendance",
    title: "Attendance Rules & Timers",
    blurb: "Define automated check-in cutoffs, cooldown windows, and dual-direction auto logic.",
    icon: Clock,
    fields: [
      {
        k: "late_cutoff",
        label: "Late Arrival Cutoff Time",
        kind: "text",
        help: "Daily check-ins logged after this institutional time (HH:MM in 24-hr format) are automatically tagged Late.",
      },
      {
        k: "default_mode",
        label: "Default Camera Operating Mode",
        kind: "select",
        opts: ["auto", "check_in", "check_out"],
        help: "Auto logs morning arrival as Check-In and afternoon departure as Check-Out automatically.",
      },
      {
        k: "attendance_cooldown_s",
        label: "Repeat-Scan Cooldown",
        kind: "number",
        min: 30,
        max: 1800,
        unit: "seconds",
        help: "Time buffer before the same student can trigger another attendance event while near the camera.",
      },
      {
        k: "min_checkout_gap_min",
        label: "Minimum Gap for Check-Out",
        kind: "number",
        min: 10,
        max: 480,
        unit: "minutes",
        help: "In Auto mode, departures sighted earlier than this duration after morning check-in are safely ignored.",
      },
    ],
  },
  {
    id: "cameras",
    title: "Connected Video Sources",
    blurb: "Manage local USB webcams, high-speed kiosk sensors, and campus RTSP IP surveillance feeds.",
    icon: Video,
  },
  {
    id: "gallery",
    title: "Face Vector Gallery",
    blurb: "In-memory FAISS / HNSW normalized ArcFace vector representations and real-time rebuild.",
    icon: Database,
  },
  {
    id: "access",
    title: "Access & Credentials",
    blurb: "Kiosk client access secret, institutional authentication status, and security protocols.",
    icon: ShieldCheck,
  },
];

const inputClass =
  "h-9 rounded-xl border border-v-border bg-bg-page px-3 text-[13px] text-text outline-none " +
  "focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50";

function SettingRow({
  f,
  value,
  set,
  disabled,
}: {
  f: F;
  value: number | string;
  set: (x: number | string) => void;
  disabled: boolean;
}) {
  const n = Number(value);
  const warn =
    f.rec && f.warn ? (n < f.rec[0] ? f.warn[0] : n > f.rec[1] ? f.warn[1] : "") : "";
  const isRecommended = f.rec ? n >= f.rec[0] && n <= f.rec[1] : true;

  return (
    <div className="flex flex-col gap-3 py-5 border-b border-v-border/70 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="max-w-lg space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-text">{f.label}</span>
          {f.rec && (
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium ${
                isRecommended
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-warning/15 text-warning-text border border-warning/30"
              }`}
            >
              {isRecommended ? "Recommended range" : "Out of suggested bounds"}
            </span>
          )}
        </div>
        <p className="text-[12px] text-text-muted leading-relaxed">{f.help}</p>
        {warn && (
          <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-warning/10 border border-warning/25 p-2.5 text-warning-text text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{warn}</span>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center">
        {f.kind === "range" && (
          <div className="w-72 space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={n}
                disabled={disabled}
                onChange={(e) => set(Number(e.target.value))}
                className="flex-1 accent-primary h-1.5 bg-bg-page rounded-lg cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg tabular-nums min-w-[52px] text-center">
                {n.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-text-muted">
              <span>Min: {f.min}</span>
              <span className="font-medium text-text">
                Recommended: {f.rec![0]} – {f.rec![1]}
              </span>
              <span>Max: {f.max}</span>
            </div>
          </div>
        )}

        {f.kind === "number" && (
          <div className="inline-flex items-center gap-2">
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={n}
              disabled={disabled}
              onChange={(e) => set(Number(e.target.value))}
              className={`${inputClass} w-28 text-right font-mono font-semibold`}
            />
            <span className="text-xs font-medium text-text-muted bg-bg-page border border-v-border px-2.5 py-1.5 rounded-lg">
              {f.unit}
            </span>
          </div>
        )}

        {f.kind === "text" && (
          <div className="relative">
            <input
              type="text"
              value={value}
              placeholder="09:15"
              disabled={disabled}
              onChange={(e) => set(e.target.value)}
              className={`${inputClass} w-32 font-mono text-center font-bold tracking-wider`}
            />
          </div>
        )}

        {f.kind === "select" && (
          <select
            value={value}
            disabled={disabled}
            onChange={(e) => set(e.target.value)}
            className={`${inputClass} min-w-[140px] font-medium capitalize cursor-pointer`}
          >
            {f.opts!.map((o) => (
              <option key={o} value={o}>
                {o === "auto" ? "Automatic (In/Out)" : o === "check_in" ? "Check-In Only" : "Check-Out Only"}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function CamerasSection({
  cams,
  set,
  disabled,
}: {
  cams: Cam[];
  set: (c: Cam[]) => void;
  disabled: boolean;
}) {
  const edit = (id: string, p: Partial<Cam>) =>
    set(cams.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const addPreset = (type: "usb" | "rtsp") => {
    const id = `cam-${Date.now()}`;
    if (type === "usb") {
      set([
        ...cams,
        {
          id,
          name: `Kiosk USB Camera ${cams.length + 1}`,
          url: "0",
          mode: "auto",
        },
      ]);
    } else {
      set([
        ...cams,
        {
          id,
          name: `Campus Gate ${cams.length + 1}`,
          url: "rtsp://admin:nscet2026@192.168.1.100:554/live/ch0",
          mode: "check_in",
        },
      ]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-v-border">
        <div>
          <h3 className="text-sm font-semibold text-text">Configured Stream Endpoints</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Active camera feeds analyzed by the YOLO11 + ArcFace edge worker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => addPreset("usb")}
            className="text-xs border-v-border hover:bg-bg-page flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5 text-primary" />
            + Add USB Webcam
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => addPreset("rtsp")}
            className="text-xs border-v-border hover:bg-bg-page flex items-center gap-1.5"
          >
            <Video className="w-3.5 h-3.5 text-primary" />
            + Add RTSP Feed
          </Button>
        </div>
      </div>

      {cams.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-v-border bg-bg-page/50">
          <Video className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-text">No cameras configured</p>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            Click above to add a local USB webcam (device 0) or an institutional RTSP camera stream.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cams.map((c, idx) => (
            <div
              key={c.id}
              className="p-4 rounded-xl border border-v-border bg-surface hover:border-primary/40 transition-all shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="font-mono text-xs font-bold text-text-muted uppercase">
                    Feed #{idx + 1}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono border-v-border">
                    {c.id}
                  </Badge>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => set(cams.filter((x) => x.id !== c.id))}
                  className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Remove camera"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_2.5fr_1.2fr] gap-3">
                <div>
                  <label className="text-[11px] font-medium text-text-muted block mb-1">
                    Camera Label
                  </label>
                  <input
                    className={`${inputClass} w-full font-medium`}
                    value={c.name}
                    placeholder="e.g. Main Entrance Kiosk"
                    disabled={disabled}
                    onChange={(e) => edit(c.id, { name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-text-muted block mb-1">
                    Stream Source (RTSP URI or 0 for USB)
                  </label>
                  <input
                    className={`${inputClass} w-full font-mono text-xs`}
                    value={c.url}
                    placeholder="0 or rtsp://username:password@ip:port/stream"
                    disabled={disabled}
                    onChange={(e) => edit(c.id, { url: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-text-muted block mb-1">
                    Operating Mode
                  </label>
                  <select
                    className={`${inputClass} w-full capitalize cursor-pointer`}
                    value={c.mode}
                    disabled={disabled}
                    onChange={(e) => edit(c.id, { mode: e.target.value })}
                  >
                    <option value="auto">Auto (In / Out)</option>
                    <option value="check_in">Check-In Only</option>
                    <option value="check_out">Check-Out Only</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GallerySection({ disabled }: { disabled: boolean }) {
  const [healthData, setHealthData] = useState<{ persons?: number; gallery_size?: number }>({});
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [lastRebuilt, setLastRebuilt] = useState<Date | null>(null);

  const loadStats = () => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setHealthData(data))
      .catch(() => {});
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleRebuild = async () => {
    setStatus("busy");
    try {
      const res = await fetch("/api/gallery/rebuild", { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        setStatus("done");
        setLastRebuilt(new Date());
        loadStats();
        toast.success(`Face vector gallery rebuilt: ${body.gallery_size ?? 0} vectors synchronized`);
      } else {
        setStatus("error");
        toast.error("Gallery rebuild failed on backend server.");
      }
    } catch {
      setStatus("error");
      toast.error("Failed to connect to backend service.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-v-border bg-bg-page p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-text-muted tracking-wider uppercase">
              Enrolled Identities
            </span>
            <div className="text-3xl font-extrabold text-text tabular-nums mt-1">
              {healthData.persons ?? "—"}
            </div>
            <p className="text-[11px] text-text-muted mt-1">Active student & faculty profiles</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="rounded-2xl border border-v-border bg-bg-page p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-text-muted tracking-wider uppercase">
              Face Embedding Vectors
            </span>
            <div className="text-3xl font-extrabold text-text tabular-nums mt-1">
              {healthData.gallery_size ?? "—"}
            </div>
            <p className="text-[11px] text-text-muted mt-1">512-D ArcFace float vectors in RAM</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-v-border bg-surface p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-text">Hot-Reload Biometric Gallery</h4>
            <p className="text-xs text-text-muted mt-1 leading-relaxed max-w-lg">
              Synchronizes in-memory FAISS / numpy vector indexes from the encrypted database.
              Use this after bulk student enrollments or profile edits. Does not interrupt live streams or require restarting the backend.
            </p>
          </div>
          <Button
            type="button"
            disabled={disabled || status === "busy"}
            onClick={handleRebuild}
            className="bg-primary hover:bg-primary-hover text-white text-xs px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === "busy" ? "animate-spin" : ""}`} />
            {status === "busy" ? "Rebuilding Index..." : "Rebuild Face Gallery"}
          </Button>
        </div>

        <div className="pt-2 border-t border-v-border/60 flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                status === "done"
                  ? "bg-primary"
                  : status === "error"
                  ? "bg-danger"
                  : "bg-primary/50"
              }`}
            />
            <span>
              {status === "done"
                ? "Gallery successfully synchronized with database."
                : status === "error"
                ? "Rebuild failed. Check backend server logs."
                : status === "busy"
                ? "Calculating ArcFace centroids and rebuilding index..."
                : "Vector gallery is active and ready."}
            </span>
          </div>
          {lastRebuilt && (
            <span className="font-mono text-[11px]">
              Last synced: {lastRebuilt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AccessSection({ disabled }: { disabled: boolean }) {
  const [tokenInput, setTokenInput] = useState(getKioskToken());
  const [showToken, setShowToken] = useState(false);
  const currentUser = api.getCurrentUser();

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    setKioskToken(tokenInput.trim());
    toast.success("Kiosk access token saved to local storage");
  };

  return (
    <div className="space-y-6">
      {/* Current Session Card */}
      <div className="rounded-2xl border border-v-border bg-bg-page p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm">
              {currentUser?.full_name ? currentUser.full_name[0].toUpperCase() : "G"}
            </div>
            <div>
              <h4 className="text-sm font-bold text-text">
                {currentUser?.full_name || "Guest Access"}
              </h4>
              <p className="text-xs text-text-muted">{currentUser?.email || "Local Workstation"}</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="capitalize font-mono text-[11px] border-primary/30 text-primary bg-primary/10"
          >
            Role: {currentUser?.role || "Faculty / Operator"}
          </Badge>
        </div>
      </div>

      {/* Kiosk Secret Key */}
      <div className="rounded-2xl border border-v-border bg-surface p-5 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-text flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Kiosk Terminal Secret Token
          </h4>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            Shared secret key utilized by unmanned tablets and kiosk browsers to authenticate real-time camera recognition.
          </p>
        </div>

        <form onSubmit={handleSaveToken} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              disabled={disabled}
              className={`${inputClass} w-full pr-10 font-mono text-xs`}
              placeholder="Enter kiosk authentication token"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-2 text-text-muted hover:text-text cursor-pointer"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button
            type="submit"
            disabled={disabled}
            className="bg-primary hover:bg-primary-hover text-white text-xs px-4 py-2 rounded-xl shrink-0"
          >
            Update Token
          </Button>
        </form>
      </div>
    </div>
  );
}

export function SettingsView({ readOnly = false }: { readOnly?: boolean }) {
  const [tab, setTab] = useState(SECTIONS[0].id);
  const [saved, setSaved] = useState<State>({ v: DEFAULTS, cams: [] });
  const [draft, setDraft] = useState<State>(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        const { cameras = [], ...v } = s;
        const next = { v: { ...DEFAULTS, ...v }, cams: cameras };
        setSaved(next);
        setDraft(next);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const sec = useMemo(() => SECTIONS.find((s) => s.id === tab) || SECTIONS[0], [tab]);
  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft]
  );

  const setV = (k: string) => (x: number | string) => {
    setDraft((d) => ({ ...d, v: { ...d.v, [k]: x } }));
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    try {
      const ok = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft.v, cameras: draft.cams }),
      })
        .then((r) => r.ok)
        .catch(() => false);

      if (ok) {
        setSaved(draft);
        setStatus("saved");
        toast.success("Settings saved successfully!");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        toast.error("Failed to save settings to server.");
      }
    } catch {
      setStatus("error");
      toast.error("Network error while saving settings.");
    }
  };

  const resetSection = () => {
    if (!sec.fields) return;
    setDraft((d) => ({
      ...d,
      v: {
        ...d.v,
        ...Object.fromEntries(sec.fields!.map((f) => [f.k, DEFAULTS[f.k]])),
      },
    }));
    toast.info(`Reset ${sec.title} fields to default values.`);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Top Banner & Institutional Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl border border-v-border bg-surface shadow-xs">
        <div>
          <div className="vantage-eyebrow text-primary">
            <span className="inline-block w-2.5 h-[1.5px] bg-primary rounded-full" />
            <span>NSCET ATTENDANCE CORE</span>
          </div>
          <h2 className="text-xl font-bold text-text mt-1">System Configuration & Parameters</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Configure ArcFace thresholds, automated attendance triggers, cameras, and vector gallery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-primary/10 border-primary/20 text-primary text-xs font-mono py-1 px-2.5"
          >
            ArcFace + YOLO11s Active
          </Badge>
          {readOnly && (
            <Badge variant="outline" className="border-warning/30 text-warning-text bg-warning/10 text-xs">
              View Only
            </Badge>
          )}
        </div>
      </div>

      {/* Main Grid: Left Nav + Right Configuration Card */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        {/* Navigation Sidebar */}
        <nav aria-label="Settings sections" className="flex md:flex-col gap-1.5 overflow-x-auto pb-2 md:pb-0">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = tab === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setTab(s.id)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  active
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text hover:bg-surface border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-text-muted"}`} />
                <span>{s.title}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Section Content Card */}
        <Card className="border-v-border bg-surface shadow-xs rounded-2xl">
          <CardHeader className="p-6 border-b border-v-border/70 flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                  <sec.icon className="w-4 h-4" />
                </div>
                <CardTitle className="text-base font-bold text-text">{sec.title}</CardTitle>
              </div>
              <p className="text-xs text-text-muted mt-1.5 leading-relaxed">{sec.blurb}</p>
            </div>

            {sec.fields && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetSection}
                className="text-xs text-text-muted hover:text-text flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-6">
            {sec.fields?.map((f) => (
              <SettingRow
                key={f.k}
                f={f}
                value={draft.v[f.k]}
                set={setV(f.k)}
                disabled={readOnly}
              />
            ))}

            {tab === "cameras" && (
              <CamerasSection
                cams={draft.cams}
                set={(cams) => setDraft((d) => ({ ...d, cams }))}
                disabled={readOnly}
              />
            )}

            {tab === "gallery" && <GallerySection disabled={readOnly} />}

            {tab === "access" && <AccessSection disabled={readOnly} />}
          </CardContent>
        </Card>
      </div>

      {/* Floating Save / Discard Bar (Shows when changes are unsaved) */}
      {dirty && !readOnly && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface/95 backdrop-blur-md border border-v-border shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-warning animate-ping shrink-0" />
              <div>
                <p className="text-xs font-semibold text-text">Unsaved modifications</p>
                <p className="text-[11px] text-text-muted">
                  {status === "error"
                    ? "Error saving. Please retry."
                    : status === "saved"
                    ? "All changes persisted."
                    : "You have unsaved changes in system settings."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraft(saved)}
                className="text-xs rounded-xl border-v-border"
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={status === "saving"}
                className="bg-primary hover:bg-primary-hover text-white text-xs rounded-xl flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {status === "saving" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsView;
