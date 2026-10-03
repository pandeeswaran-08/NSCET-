import React, {
  useState,
  useEffect,
  useCallback,
  lazy,
  Suspense,
  useMemo,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { api, HealthStatus, UserInfo } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import {
  COLLEGE_NAME,
  COLLEGE_SHORT_NAME,
} from "@/lib/college";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsModal } from "@/components/SettingsModal";
import { LoginModal, SaaSLoginCard } from "@/components/LoginModal";
import { toast } from "sonner";
import {
  Scan,
  Users,
  Calendar,
  Video,
  Settings,
  Search,
  Command as CommandIcon,
  Download,
  LogIn,
  UserCheck,
  X,
  Shield,
  Bell,
  Signal,
  MoreVertical,
  Menu,
  BarChart3,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// Lazy-load individual module views to optimize initial bundle and isolate rendering
const ScannerView = lazy(() =>
  import("@/components/ScannerView").then((m) => ({ default: m.ScannerView })),
);
const AttendanceView = lazy(() =>
  import("@/components/AttendanceView").then((m) => ({
    default: m.AttendanceView,
  })),
);
const PersonnelView = lazy(() =>
  import("@/components/PersonnelView").then((m) => ({
    default: m.PersonnelView,
  })),
);
const CamerasView = lazy(() =>
  import("@/components/CamerasView").then((m) => ({ default: m.CamerasView })),
);
const DataExplorerView = lazy(() =>
  import("@/components/DataExplorerView").then((m) => ({
    default: m.DataExplorerView,
  })),
);
const SettingsView = lazy(() =>
  import("@/components/SettingsView").then((m) => ({
    default: m.SettingsView,
  })),
);

export const Route = createFileRoute("/")(
  { component: DashboardPage },
);

type TabType = "scanner" | "analytics" | "attendance" | "personnel" | "cameras" | "auth";

/* ========================================================================= */
/* Vantage live clock hook                                                   */
/* ========================================================================= */
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toLocaleTimeString("en-GB", { hour12: false });
}

/* ========================================================================= */
/* Page title mappings with Vantage eyebrow + title pattern                  */
/* ========================================================================= */
const PAGE_META: Record<TabType, { eyebrow: string; title: string; subtitle: string }> = {
  scanner: {
    eyebrow: "CONTROL CENTER",
    title: "Live monitoring",
    subtitle: "Real-time biometric face detection across all entrance cameras",
  },
  analytics: {
    eyebrow: "DATA & VISUALIZATION",
    title: "Analytics & Monitoring",
    subtitle: "Real-time attendance telemetry, intra-day flow curves, and deep identity analytics",
  },
  cameras: {
    eyebrow: "CAMERA FEEDS",
    title: "Cameras",
    subtitle: "CCTV feeds, worker status, FPS and reconnect state",
  },
  attendance: {
    eyebrow: "ACTIVITY LOG",
    title: "Activity",
    subtitle: "Searchable attendance records with export capabilities",
  },
  personnel: {
    eyebrow: "IDENTITY REGISTRY",
    title: "Personnel",
    subtitle: "Staff management and multi-photo ArcFace enrollment",
  },
  auth: {
    eyebrow: "SYSTEM CONFIGURATION",
    title: "Settings",
    subtitle: "Recognition parameters, attendance rules, cameras and biometric vector gallery",
  },
};

function ViewLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

/* ========================================================================= */
/* MAIN DASHBOARD                                                            */
/* ========================================================================= */
function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("scanner");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(
    api.getCurrentUser(),
  );
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const clock = useLiveClock();

  // Poll backend health status
  useEffect(() => {
    const fetchHealth = () => {
      api
        .getHealth()
        .then(setHealth)
        .catch(() => setHealth(null));
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [refreshCounter]);

  // Sync user state on refresh or login change
  useEffect(() => {
    setCurrentUser(api.getCurrentUser());
    if (api.getAuthToken()) {
      api
        .getMe()
        .then(setCurrentUser)
        .catch(() => setCurrentUser(null));
    }
  }, [refreshCounter]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
        setCommandSearch("");
        return;
      }

      if (e.key === "Escape" && isCommandOpen) {
        setIsCommandOpen(false);
        return;
      }

      if (isInput) return;

      if ((e.key === "[" || (e.ctrlKey && e.key.toLowerCase() === "b")) && !e.metaKey) {
        e.preventDefault();
        setIsSidebarCollapsed((p) => !p);
        return;
      }

      const keyMap: Record<string, TabType> = {
        s: "scanner",
        e: "analytics",
        a: "attendance",
        p: "personnel",
        c: "cameras",
        l: "auth",
      };
      const tab = keyMap[e.key.toLowerCase()];
      if (tab && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setActiveTab(tab);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandOpen]);

  /* Sidebar navigation items matching Vantage spec */
  const navItems = [
    {
      id: "scanner" as TabType,
      label: "Overview",
      icon: Scan,
      shortcut: "S",
      badge: null,
    },
    {
      id: "analytics" as TabType,
      label: "Analytics & Monitoring",
      icon: BarChart3,
      shortcut: "E",
      badge: "Daily",
    },
    {
      id: "cameras" as TabType,
      label: "Cameras",
      icon: Video,
      shortcut: "C",
      badge: health ? "03" : null,
    },
    {
      id: "attendance" as TabType,
      label: "Activity",
      icon: Calendar,
      shortcut: "A",
      badge: null,
    },
    {
      id: "personnel" as TabType,
      label: "Personnel",
      icon: Users,
      shortcut: "P",
      badge: health?.gallery_size ? `${health.gallery_size}` : null,
    },
    {
      id: "auth" as TabType,
      label: "Settings",
      icon: Settings,
      shortcut: "L",
      badge: null,
    },
  ];

  // Command palette items
  const commandActions = useMemo(
    () => [
      {
        id: "nav-scanner",
        category: "Navigation",
        label: "Go to Overview",
        shortcut: "S",
        icon: Scan,
        action: () => setActiveTab("scanner"),
      },
      {
        id: "nav-analytics",
        category: "Navigation",
        label: "Go to Analytics & Monitoring",
        shortcut: "E",
        icon: BarChart3,
        action: () => setActiveTab("analytics"),
      },
      {
        id: "nav-cameras",
        category: "Navigation",
        label: "Go to Cameras",
        shortcut: "C",
        icon: Video,
        action: () => setActiveTab("cameras"),
      },
      {
        id: "nav-attendance",
        category: "Navigation",
        label: "Go to Activity",
        shortcut: "A",
        icon: Calendar,
        action: () => setActiveTab("attendance"),
      },
      {
        id: "nav-personnel",
        category: "Navigation",
        label: "Go to Personnel",
        shortcut: "P",
        icon: Users,
        action: () => setActiveTab("personnel"),
      },
      {
        id: "nav-settings",
        category: "Navigation",
        label: "Go to Settings",
        shortcut: "L",
        icon: Settings,
        action: () => setActiveTab("auth"),
      },
      {
        id: "act-toggle-sidebar",
        category: "Actions",
        label: isSidebarCollapsed ? "Expand Sidebar Navigation" : "Collapse Sidebar Navigation",
        shortcut: "[",
        icon: PanelLeft,
        action: () => setIsSidebarCollapsed((p) => !p),
      },
      {
        id: "act-account",
        category: "Actions",
        label: currentUser
          ? `Account Profile (${currentUser.email})`
          : "Faculty / Admin Sign In",
        shortcut: null,
        icon: UserCheck,
        action: () => setIsLoginOpen(true),
      },
      {
        id: "act-settings",
        category: "Actions",
        label: "Open System Diagnostics",
        shortcut: null,
        icon: Settings,
        action: () => setIsSettingsOpen(true),
      },
      {
        id: "act-export",
        category: "Actions",
        label: "Export Attendance CSV Report",
        shortcut: null,
        icon: Download,
        action: () => {
          window.open(api.getExportUrl("csv"), "_blank");
          toast.success("Downloading attendance CSV export...");
        },
      },
    ],
    [currentUser],
  );

  const filteredCommands = useMemo(() => {
    const q = commandSearch.toLowerCase().trim();
    if (!q) return commandActions;
    return commandActions.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [commandActions, commandSearch]);

  const pageMeta = PAGE_META[activeTab];
  const currentNavLabel = navItems.find((n) => n.id === activeTab)?.label ?? "Overview";

  /* ======================================================================= */
  /* User avatar initials                                                    */
  /* ======================================================================= */
  const userInitials = currentUser
    ? currentUser.full_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <div className="relative min-h-screen bg-bg-page text-text flex">
      {/* ================================================================= */}
      {/* SIDEBAR — Movable / Collapsible (247px <-> 72px)                  */}
      {/* ================================================================= */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 bg-sidebar-bg text-sidebar-text z-40 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? "w-[72px]" : "w-[247px]"
        }`}
      >
        {/* Logo Block */}
        <div
          className={`h-16 flex items-center transition-all duration-300 ${
            isSidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden min-w-0">
            <div className="w-10 h-10 flex items-center justify-center shrink-0 bg-transparent">
              <img
                src="/assets/college-logo.png"
                alt="NSCET Logo"
                className="w-full h-full object-contain select-none drop-shadow-sm"
              />
            </div>
            {!isSidebarCollapsed && (
              <div className="leading-tight overflow-hidden min-w-0 animate-in fade-in duration-200">
                <span className="text-[20px] font-bold text-white tracking-tight uppercase">
                  {BRAND.name}
                </span>
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-sidebar-muted truncate">
                  {BRAND.tagline}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsSidebarCollapsed((p) => !p)}
            className={`p-1.5 rounded-lg text-sidebar-muted hover:text-white hover:bg-sidebar-active-bg transition-colors cursor-pointer shrink-0 ${
              isSidebarCollapsed ? "hidden" : "flex"
            }`}
            title="Collapse sidebar ( [ )"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* WORKSPACE section */}
        <div
          className={`pt-6 pb-2 transition-all duration-300 ${
            isSidebarCollapsed ? "px-2 text-center" : "px-4"
          }`}
        >
          {!isSidebarCollapsed ? (
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-sidebar-muted px-1.5">
              WORKSPACE
            </span>
          ) : (
            <div className="w-6 h-px bg-white/10 mx-auto" />
          )}
        </div>

        <nav className="flex-1 px-2.5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const navBtn = (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center h-11 rounded-[10px] text-[15px] font-medium transition-all duration-150 cursor-pointer text-left relative group ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  isActive
                    ? "bg-sidebar-active-bg text-white"
                    : "text-sidebar-text hover:bg-sidebar-active-bg/50 hover:text-white"
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    isActive ? "text-primary" : "text-sidebar-muted"
                  }`}
                  strokeWidth={1.75}
                />
                {!isSidebarCollapsed && (
                  <>
                    <span className="flex-1 min-w-0 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="t-mono-xs px-1.5 py-0.5 rounded-[6px] bg-sidebar-active-bg text-sidebar-muted shrink-0 inline-flex items-center justify-center leading-none">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute right-0 top-0 bottom-0 w-[3px] bg-primary" />
                )}
              </button>
            );

            if (isSidebarCollapsed) {
              return (
                <Tooltip key={item.id} delayDuration={100}>
                  <TooltipTrigger asChild>{navBtn}</TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="bg-sidebar-bg text-white border-white/10 text-xs font-semibold py-1.5 px-3 z-50 shadow-xl"
                  >
                    {item.label} {item.shortcut && <span className="opacity-60 ml-1">({item.shortcut})</span>}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return navBtn;
          })}
        </nav>

        {/* Sticky bottom: System status + User row */}
        <div className="mt-auto border-t border-white/10 p-2.5 space-y-2">
          {/* System status card */}
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-sidebar-active-bg/60">
              <Shield className="w-4 h-4 text-sidebar-muted shrink-0" strokeWidth={1.75} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-sidebar-text truncate leading-tight">
                  System status
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      health?.status === "ok"
                        ? "bg-primary animate-live-pulse"
                        : "bg-warning"
                    }`}
                  />
                  <span className="t-mono-xs text-sidebar-muted leading-none">
                    {health?.status === "ok" ? "Operational" : "Connecting..."}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className="h-10 w-full flex items-center justify-center rounded-[10px] bg-sidebar-active-bg/60 cursor-pointer">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      health?.status === "ok"
                        ? "bg-primary animate-live-pulse"
                        : "bg-warning"
                    }`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-sidebar-bg text-white border-white/10 text-xs z-50 shadow-xl">
                System: {health?.status === "ok" ? "Operational" : "Connecting..."}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Hairline */}
          <div className="border-t border-white/10" />

          {/* User row */}
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5 px-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold shrink-0">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-sidebar-text truncate leading-tight">
                  {currentUser?.full_name || "Guest"}
                </p>
                <p className="text-[11px] text-sidebar-muted capitalize truncate leading-normal mt-0.5">
                  {currentUser?.role || "Not signed in"}
                </p>
              </div>
              <button
                onClick={() => setIsLoginOpen(true)}
                className="p-1 rounded-md text-sidebar-muted hover:text-white cursor-pointer transition-colors"
                aria-label="Account menu"
              >
                <MoreVertical className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="w-full flex items-center justify-center cursor-pointer p-1"
                >
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold shrink-0">
                    {userInitials}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-sidebar-bg text-white border-white/10 text-xs z-50 shadow-xl">
                {currentUser?.full_name || "Sign In"} ({currentUser?.role || "Guest"})
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>

      {/* ================================================================= */}
      {/* MAIN CONTENT AREA (offset by sidebar width on lg)                  */}
      {/* ================================================================= */}
      <div
        className={`flex-1 flex flex-col min-w-0 pb-16 lg:pb-0 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[247px]"
        }`}
      >
        {/* =============================================================== */}
        {/* TOP BAR — Surface, 56px, sticky, bottom hairline                  */}
        {/* =============================================================== */}
        <header className="sticky top-0 z-30 h-14 bg-surface border-b border-v-border flex items-center justify-between px-6 lg:px-9">
          {/* Left: hamburger (mobile) + desktop toggle + breadcrumb */}
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsMobileMenuOpen((p) => !p)}
              className="lg:hidden p-1.5 rounded-[10px] text-text-muted hover:bg-bg-page hover:text-text cursor-pointer transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} />
            </button>

            {/* Desktop Sidebar Toggle */}
            <button
              onClick={() => setIsSidebarCollapsed((p) => !p)}
              className="hidden lg:inline-flex p-1.5 rounded-[10px] text-text-muted hover:bg-bg-page hover:text-text cursor-pointer transition-colors"
              title={isSidebarCollapsed ? "Expand sidebar ( [ )" : "Collapse sidebar ( [ )"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft className="w-5 h-5" strokeWidth={1.75} />
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 t-small leading-none">
              <span className="text-text-muted">Workspace</span>
              <span className="text-text-faint">/</span>
              <span className="text-text font-medium">{currentNavLabel}</span>
            </div>
          </div>

          {/* Right: mode pill, divider, live clock, bell, avatar */}
          <div className="flex items-center gap-3">
            {/* Command palette trigger */}
            <button
              onClick={() => {
                setIsCommandOpen(true);
                setCommandSearch("");
              }}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] border border-v-border bg-surface text-text-muted hover:text-text text-xs transition-colors cursor-pointer leading-none"
              title="Command Palette (Cmd+K)"
            >
              <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>Search...</span>
              <kbd className="hidden md:inline-flex items-center gap-0.5 t-mono-xs px-1.5 py-0.5 rounded-[4px] bg-bg-page border border-v-border text-text-faint leading-none">
                <CommandIcon className="w-2.5 h-2.5 inline shrink-0" />K
              </kbd>
            </button>

            {/* Mode pill */}
            <div className="vantage-pill bg-primary-soft text-primary hidden md:inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-live-pulse" />
              DEMO MODE
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-5 bg-v-border" />

            {/* Live mono clock */}
            <span className="hidden md:inline-flex items-center font-mono text-[13px] font-medium text-text tabular-nums leading-none">
              {clock}
            </span>

            {/* Notification bell */}
            <button
              className="relative p-1.5 rounded-[10px] text-text-muted hover:bg-bg-page hover:text-text cursor-pointer transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger" />
            </button>

            {/* User avatar */}
            <button
              onClick={() => setIsLoginOpen(true)}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
              title={currentUser ? currentUser.full_name : "Sign In"}
            >
              {userInitials}
            </button>
          </div>
        </header>

        {/* =============================================================== */}
        {/* PAGE CONTENT (36px page padding sharing left edges)               */}
        {/* =============================================================== */}
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-6 lg:px-9 py-7 space-y-7">
          {/* Vantage Page Header: eyebrow + title + subtitle */}
          <div className="space-y-2">
            <div className="vantage-eyebrow text-primary">
              <span className="inline-block w-3 h-[1.5px] bg-primary rounded-full shrink-0" aria-hidden="true" />
              <span>{pageMeta.eyebrow}</span>
            </div>
            <h1 className="t-h1 text-text">
              {pageMeta.title}
              <span className="text-primary inline-block">.</span>
            </h1>
            <p className="t-body text-text-muted max-w-xl">
              {pageMeta.subtitle}
            </p>
          </div>

          {/* Tab Content */}
          <Suspense fallback={<ViewLoadingSkeleton />}>
            {activeTab === "scanner" && (
              <ScannerView
                onAttendanceMarked={() => setRefreshCounter((c) => c + 1)}
              />
            )}

            {activeTab === "analytics" && <DataExplorerView />}

            {activeTab === "attendance" && (
              <AttendanceView refreshTrigger={refreshCounter} />
            )}

            {activeTab === "personnel" && (
              <PersonnelView
                onPersonnelUpdated={() => setRefreshCounter((c) => c + 1)}
              />
            )}

            {activeTab === "cameras" && <CamerasView />}

            {activeTab === "auth" && (
              <SettingsView />
            )}
          </Suspense>
        </main>

        {/* =============================================================== */}
        {/* FOOTER                                                           */}
        {/* =============================================================== */}
        <footer className="mt-auto border-t border-v-border bg-surface py-4 px-6 lg:px-9">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between text-[12px] text-text-muted">
            <span>
              © 2026{" "}
              <span className="font-semibold text-text uppercase">
                {BRAND.name}
              </span>{" "}
              Attendance
            </span>
            <div className="flex items-center gap-1.5">
              <Signal className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <span className="t-mono-xs text-text-muted">
                {health?.status === "ok" ? "All systems operational" : "Connecting..."}
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* ================================================================= */}
      {/* MOBILE BOTTOM TAB BAR                                              */}
      {/* ================================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-v-border flex items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full min-h-[44px] min-w-[44px] gap-1 transition-colors duration-150 cursor-pointer ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ================================================================= */}
      {/* MOBILE SLIDE-OVER SIDEBAR DRAWER                                   */}
      {/* ================================================================= */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-sidebar-bg/60 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative w-[280px] bg-sidebar-bg text-sidebar-text flex flex-col animate-fade-in-up">
            <div className="h-14 flex items-center justify-between px-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center shrink-0 bg-transparent">
                  <img
                    src="/assets/college-logo.png"
                    alt="NSCET Logo"
                    className="w-full h-full object-contain select-none drop-shadow-sm"
                  />
                </div>
                <span className="text-lg font-bold text-white uppercase">
                  {BRAND.name}
                </span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-sidebar-muted hover:text-white cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 h-11 rounded-[10px] text-sm font-medium transition-colors cursor-pointer text-left ${
                      isActive
                        ? "bg-sidebar-active-bg text-white"
                        : "text-sidebar-text hover:bg-sidebar-active-bg/50 hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 ${
                        isActive ? "text-primary" : "text-sidebar-muted"
                      }`}
                      strokeWidth={1.75}
                    />
                    <span className="flex-1 truncate min-w-0">{item.label}</span>
                    {item.badge && (
                      <span className="t-mono-xs px-1.5 py-0.5 rounded-[6px] bg-sidebar-active-bg text-sidebar-muted inline-flex items-center justify-center leading-none">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold shrink-0">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-text truncate leading-tight">
                  {currentUser?.full_name || "Guest"}
                </p>
                <p className="text-[10px] text-sidebar-muted truncate leading-normal mt-0.5">
                  {currentUser?.email || "Not signed in"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ================================================================= */}
      {/* COMMAND PALETTE (Cmd+K)                                            */}
      {/* ================================================================= */}
      {isCommandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-sidebar-bg/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-v-border rounded-[16px] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[420px]">
            {/* Search bar */}
            <div className="flex items-center px-4 py-3 border-b border-v-border gap-2">
              <Search className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.75} />
              <input
                type="text"
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                placeholder="Type a command or search..."
                autoFocus
                className="w-full bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none h-8 leading-normal"
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                className="text-text-muted hover:text-text cursor-pointer p-0.5"
                aria-label="Close command palette"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            {/* Results */}
            <div className="overflow-y-auto p-2 space-y-0.5">
              {filteredCommands.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-muted">
                  No matching actions found.
                </div>
              ) : (
                filteredCommands.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setIsCommandOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-[10px] text-sm text-text-muted hover:text-text hover:bg-bg-page transition-colors cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
                        <span className="truncate leading-none">{cmd.label}</span>
                      </div>
                      {cmd.shortcut && (
                        <kbd className="t-mono-xs px-1.5 py-0.5 rounded-[4px] bg-bg-page border border-v-border text-text-faint shrink-0 inline-flex items-center justify-center leading-none">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODALS                                                             */}
      {/* ================================================================= */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onUpdated={() => setRefreshCounter((c) => c + 1)}
      />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        currentUser={currentUser}
        onAuthChange={(user) => {
          setCurrentUser(user);
          setRefreshCounter((c) => c + 1);
        }}
      />
    </div>
  );
}
