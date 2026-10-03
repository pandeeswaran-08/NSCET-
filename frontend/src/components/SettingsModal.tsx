import React, { useState, useEffect } from "react";
import {
  api,
  getKioskToken,
  setKioskToken,
  HealthStatus,
  UserInfo,
} from "@/lib/api";
import {
  SYSTEM_PROCESSES,
  COLLEGE_NAME,
  COLLEGE_SHORT_NAME,
} from "@/lib/college";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings,
  X,
  Key,
  Database,
  Layers,
  RefreshCw,
  Eye,
  EyeOff,
  Radio,
  Check,
  ShieldCheck,
  UserCheck,
  Cpu,
} from "lucide-react";

export function SettingsModal({
  isOpen,
  onClose,
  onUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [kioskTokenInput, setKioskTokenInput] = useState("");
  const [showKioskToken, setShowKioskToken] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    if (isOpen) {
      setKioskTokenInput(getKioskToken());
      setCurrentUser(api.getCurrentUser());
      checkHealth();
    }
  }, [isOpen]);

  const checkHealth = async () => {
    setIsLoadingHealth(true);
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch {
      toast.error("Failed to reach system diagnostics");
    } finally {
      setIsLoadingHealth(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const data = await api.getHealth();
      setHealth(data);
      if (data.status === "ok") {
        toast.success(
          `Connection verified! System active with ${data.gallery_size} enrolled identities.`,
        );
      } else {
        toast.warning("System responding, but reports degraded services.");
      }
    } catch (err: any) {
      toast.error(
        "Connection test failed: " + (err.message || "System offline"),
      );
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveKioskToken = (e: React.FormEvent) => {
    e.preventDefault();
    setKioskToken(kioskTokenInput.trim());
    setSavedSuccess(true);
    toast.success("Kiosk access token saved");
    setTimeout(() => {
      setSavedSuccess(false);
      onUpdated?.();
      onClose();
    }, 800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-surface border border-v-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-6 text-text">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-v-border pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Settings className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h3 className="t-body font-bold text-text truncate">
                {COLLEGE_SHORT_NAME} System Diagnostics
              </h3>
              <p className="t-small text-text-muted truncate">
                Institutional biometric pipeline, storage, and device security
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-text-muted hover:text-text rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </Button>
        </div>

        {/* Section 1: Standardized Diagnostics Indicators */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="t-eyebrow text-text-muted">
              Live Subsystem Status
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkHealth}
              disabled={isLoadingHealth}
              className="h-7 t-small text-text-muted hover:text-text gap-1 cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${isLoadingHealth ? "animate-spin" : ""}`}
                strokeWidth={1.75}
              />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {/* Database Card */}
            <div className="p-3 bg-bg-page rounded-xl border border-v-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5 font-medium text-xs leading-none">
                  <Database className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                  <span>Database</span>
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    health?.database
                      ? "bg-primary shadow-[0_0_6px_var(--primary)]"
                      : "bg-danger"
                  }`}
                />
              </div>
              <p className="text-xs font-bold text-text leading-tight pt-0.5">
                {health?.database ? "Connected (SQLite)" : "Disconnected"}
              </p>
            </div>

            {/* Cache Card */}
            <div className="p-3 bg-bg-page rounded-xl border border-v-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5 font-medium text-xs leading-none">
                  <Layers className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                  <span>Gallery Cache</span>
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    health?.status === "ok"
                      ? "bg-primary shadow-[0_0_6px_var(--primary)]"
                      : "bg-warning"
                  }`}
                />
              </div>
              <p className="text-xs font-bold text-text leading-tight pt-0.5">
                {health?.status === "ok" ? "In-Memory Active" : "Degraded"}
              </p>
            </div>

            {/* Enrolled Faces Card */}
            <div className="p-3 bg-bg-page rounded-xl border border-v-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5 font-medium text-xs leading-none">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                  <span>Enrolled Faces</span>
                </span>
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_var(--primary)] shrink-0" />
              </div>
              <p className="text-xs font-bold text-text leading-tight pt-0.5">
                {health?.gallery_size ?? 0} ArcFace Profiles
              </p>
            </div>

            {/* Camera Workers Card */}
            <div className="p-3 bg-bg-page rounded-xl border border-v-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5 font-medium text-xs leading-none">
                  <Cpu className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                  <span>Camera Workers</span>
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    health?.status === "ok"
                      ? "bg-primary shadow-[0_0_6px_var(--primary)]"
                      : "bg-text-muted"
                  }`}
                />
              </div>
              <p className="text-xs font-bold text-text leading-tight pt-0.5">
                {health?.status === "ok" ? "Worker Subsystem Active" : "Standby / Stopped"}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: 8 Standardized Processes List */}
        <div className="space-y-2">
          <span className="t-eyebrow text-text-muted">
            Biometric Pipeline Processes
          </span>
          <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-bg-page rounded-xl border border-v-border">
            {SYSTEM_PROCESSES.map((proc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-xs text-text truncate leading-normal">
                    <strong className="text-text font-semibold">{proc.name}</strong> —{" "}
                    {proc.function}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-primary uppercase font-semibold shrink-0 ml-2 whitespace-nowrap leading-none inline-flex items-center">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Kiosk Security & Authenticated Account */}
        <form
          onSubmit={handleSaveKioskToken}
          className="space-y-4 pt-2 border-t border-v-border"
        >
          {currentUser && (
            <div className="p-3 bg-bg-page rounded-xl border border-v-border text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="font-semibold text-text text-sm truncate leading-tight">
                    {currentUser.full_name}
                  </p>
                  <p className="text-xs text-text-muted truncate leading-normal">
                    {currentUser.email}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="text-[9px] uppercase font-mono border-v-border text-text shrink-0 leading-none"
              >
                {currentUser.role}
              </Badge>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text flex items-center gap-1.5 leading-none">
                <Key className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                <span>Kiosk Scanner Token</span>
              </label>
              <button
                type="button"
                onClick={() => setShowKioskToken(!showKioskToken)}
                className="text-xs text-text-muted hover:text-text flex items-center gap-1 cursor-pointer leading-none"
              >
                {showKioskToken ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" strokeWidth={1.75} /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Show
                  </>
                )}
              </button>
            </div>

            <Input
              type={showKioskToken ? "text" : "password"}
              value={kioskTokenInput}
              onChange={(e) => setKioskTokenInput(e.target.value)}
              placeholder="kiosk-token-secret"
              className="font-mono text-sm h-10 bg-bg-page border-v-border text-text placeholder:text-text-faint leading-normal"
            />
            <p className="text-[11px] text-text-muted leading-tight">
              Used by standalone entrance scanner kiosks to authenticate
              attendance requests.
            </p>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTestingConnection}
              className="h-8 px-3 text-xs border-v-border bg-surface text-text hover:bg-bg-page gap-1.5 cursor-pointer inline-flex items-center justify-center leading-none"
            >
              <Radio
                className={`w-3.5 h-3.5 text-primary shrink-0 ${isTestingConnection ? "animate-pulse" : ""}`}
                strokeWidth={1.75}
              />
              <span>{isTestingConnection ? "Testing..." : "Test Connection"}</span>
            </Button>

            <Button
              type="submit"
              size="sm"
              className="h-8 px-4 bg-primary text-white hover:bg-primary-600 gap-1.5 text-xs font-semibold cursor-pointer inline-flex items-center justify-center leading-none shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={1.75} /> Saved!
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
