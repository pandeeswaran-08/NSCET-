import React, { useState } from "react";
import { api, UserProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { COLLEGE_CONFIG } from "@/lib/college";
import {
  Lock,
  Mail,
  LogIn,
  LogOut,
  Eye,
  EyeOff,
  X,
  Shield,
} from "lucide-react";

/* ========================================================================= */
/* Vantage Login Card                                                        */
/* White surface, 16px radius, 1px border, eyebrow + title header            */
/* ========================================================================= */

export interface SaaSLoginCardProps {
  currentUser: UserProfile | null;
  onAuthChange: (user: UserProfile | null) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export function SaaSLoginCard({
  currentUser,
  onAuthChange,
  onClose,
  isModal = false,
}: SaaSLoginCardProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter your college email and password.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.login(email.trim(), password);
      if (res.user) {
        onAuthChange(res.user);
        toast.success(`Welcome, ${res.user.full_name}`);
        if (onClose) onClose();
      }
    } catch (err: any) {
      toast.error(
        err?.message || "Authentication failed. Please verify your credentials.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    onAuthChange(null);
    toast.info("Signed out successfully.");
    if (onClose) onClose();
  };

  const fillDemoCredentials = (role: "admin" | "faculty") => {
    if (role === "admin") {
      setEmail(`admin@${COLLEGE_CONFIG.allowedEmailDomain}`);
      setPassword("admin123");
    } else {
      setEmail(`faculty@${COLLEGE_CONFIG.allowedEmailDomain}`);
      setPassword("faculty123");
    }
    toast.info(`Filled ${role.toUpperCase()} test credentials`);
  };

  return (
    <div className="w-full max-w-md bg-surface text-text rounded-2xl border border-v-border overflow-hidden relative shadow-2xl">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-lg bg-bg-page hover:bg-surface-elevated text-text-muted hover:text-text flex items-center justify-center transition-colors cursor-pointer border border-v-border"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}

      <div className="p-6 sm:p-8">
        {/* Eyebrow + Title */}
        <div className="mb-6">
          <div className="vantage-eyebrow mb-2">
            <span className="inline-block w-3 h-[1.5px] bg-primary rounded-full shrink-0" />
            <span>AUTHENTICATION</span>
          </div>
          <h2 className="t-title text-text">
            {currentUser ? "Account" : "Sign in"}
            <span className="text-primary inline leading-none">.</span>
          </h2>
          <p className="t-body text-text-muted mt-1">
            {currentUser
              ? "Manage your session and account details"
              : `Sign in with your @${COLLEGE_CONFIG.allowedEmailDomain} credentials`}
          </p>
        </div>

        {currentUser ? (
          /* ============================================================= */
          /* Authenticated State                                           */
          /* ============================================================= */
          <div className="space-y-4">
            {/* User info card */}
            <div className="p-4 rounded-xl border border-v-border bg-bg-page space-y-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {currentUser.full_name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="t-body font-semibold text-text truncate">
                    {currentUser.full_name}
                  </p>
                  <p className="t-small text-text-muted truncate">
                    {currentUser.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="vantage-pill bg-primary-soft text-primary whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span>{currentUser.role.toUpperCase()}</span>
                </div>
                <div className="vantage-pill bg-surface text-text-muted border border-v-border whitespace-nowrap">
                  <Shield className="w-3 h-3 text-primary shrink-0" strokeWidth={1.75} />
                  <span>ACTIVE SESSION</span>
                </div>
              </div>
            </div>

            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full h-10 gap-2 border-v-border text-text hover:bg-bg-page cursor-pointer"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
              Sign out
            </Button>
          </div>
        ) : (
          /* ============================================================= */
          /* Login Form                                                    */
          /* ============================================================= */
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text leading-none block">
                College email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" strokeWidth={1.75} />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`you@${COLLEGE_CONFIG.allowedEmailDomain}`}
                  className="pl-10 h-10 text-sm bg-surface border-v-border text-text placeholder:text-text-faint leading-normal"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text leading-none block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" strokeWidth={1.75} />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-10 pr-10 h-10 text-sm bg-surface border-v-border text-text placeholder:text-text-faint leading-normal"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text cursor-pointer transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>

            {/* Demo credentials card */}
            <div className="p-3.5 rounded-xl bg-bg-page border border-v-border space-y-2.5">
              <div className="flex items-center justify-between text-xs leading-none">
                <span className="text-text font-semibold inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span>Demo credentials</span>
                </span>
                <span className="text-[11px] text-text-muted">Click to autofill</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoCredentials("admin")}
                  className="p-3 rounded-xl bg-surface hover:bg-primary-soft text-left transition-colors border border-v-border cursor-pointer group space-y-1 shadow-2xs"
                >
                  <div className="text-xs font-semibold text-text group-hover:text-primary transition-colors leading-tight">
                    Admin
                  </div>
                  <div className="text-[11px] text-text-muted font-mono truncate leading-tight">
                    admin@nscet.edu.in
                  </div>
                  <div className="text-[10px] text-text-faint font-mono leading-tight">
                    Pass: <span className="text-text-muted font-semibold">admin123</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoCredentials("faculty")}
                  className="p-3 rounded-xl bg-surface hover:bg-primary-soft text-left transition-colors border border-v-border cursor-pointer group space-y-1 shadow-2xs"
                >
                  <div className="text-xs font-semibold text-text group-hover:text-primary transition-colors leading-tight">
                    Faculty
                  </div>
                  <div className="text-[11px] text-text-muted font-mono truncate leading-tight">
                    faculty@nscet.edu.in
                  </div>
                  <div className="text-[10px] text-text-faint font-mono leading-tight">
                    Pass: <span className="text-text-muted font-semibold">faculty123</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 gap-2 bg-primary hover:bg-primary-600 text-white text-sm font-semibold cursor-pointer inline-flex items-center justify-center leading-none shadow-xs"
            >
              <LogIn className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>{isSubmitting ? "Signing in..." : "Sign in to workspace"}</span>
            </Button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 sm:px-8 py-3 border-t border-v-border t-mono-xs text-text-muted flex items-center justify-between">
        <span>End-to-End Encrypted</span>
        <span className="font-mono">TLS 1.3</span>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* Modal Wrapper                                                             */
/* ========================================================================= */
export function LoginModal({
  isOpen,
  onClose,
  currentUser,
  onAuthChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onAuthChange: (user: UserProfile | null) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full flex items-center justify-center my-auto">
        <SaaSLoginCard
          currentUser={currentUser}
          onAuthChange={onAuthChange}
          onClose={onClose}
          isModal={true}
        />
      </div>
    </div>
  );
}
