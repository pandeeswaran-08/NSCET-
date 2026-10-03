import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api, AttendanceRecord, Person, DailyCount } from "@/lib/api";
import {
  COLLEGE_PROGRAMS,
  DEGREE_OPTIONS,
  ACADEMIC_YEARS,
  formatProgram,
  formatYear,
  getDepartmentsForDegree,
} from "@/lib/college";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  ShieldCheck,
  Download,
  RefreshCw,
  Search,
  ChevronDown,
  Video,
  Layers,
  Activity,
  ArrowUpDown,
  Filter,
  Sparkles,
  PieChart,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Check,
  ArrowUpRight,
} from "lucide-react";

type PresetRange = "today" | "yesterday" | "7days" | "14days" | "30days" | "custom";
type MetricTab = "trends" | "hourly" | "departments" | "years" | "cameras";

export function DataExplorerView() {
  // State: Range & Filters
  const [preset, setPreset] = useState<PresetRange>("today");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [selectedDegree, setSelectedDegree] = useState<string>("all");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedCamera, setSelectedCamera] = useState<string>("all");
  const [selectedKind, setSelectedKind] = useState<"all" | "check_in" | "check_out">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Visualization sub-tabs
  const [activeVizTab, setActiveVizTab] = useState<MetricTab>("trends");

  // Data State
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Interactive Hover in Charts
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Table pagination & sorting
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const [sortField, setSortField] = useState<"timestamp" | "confidence" | "name" | "dept">("timestamp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Handle Preset Changes
  const applyPreset = (p: PresetRange) => {
    setPreset(p);
    const now = new Date();
    const toIso = (d: Date) => d.toISOString().slice(0, 10);

    if (p === "today") {
      const todayStr = toIso(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (p === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = toIso(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (p === "7days") {
      const s = new Date();
      s.setDate(s.getDate() - 6);
      setStartDate(toIso(s));
      setEndDate(toIso(now));
    } else if (p === "14days") {
      const s = new Date();
      s.setDate(s.getDate() - 13);
      setStartDate(toIso(s));
      setEndDate(toIso(now));
    } else if (p === "30days") {
      const s = new Date();
      s.setDate(s.getDate() - 29);
      setStartDate(toIso(s));
      setEndDate(toIso(now));
    }
  };

  // Reset department if not valid for selected degree
  useEffect(() => {
    if (selectedDegree !== "all") {
      const depts = getDepartmentsForDegree(selectedDegree);
      if (selectedDept !== "all" && !depts.includes(selectedDept)) {
        setSelectedDept("all");
      }
    }
  }, [selectedDegree, selectedDept]);

  // Main Data Fetcher
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const degreeParam = selectedDegree !== "all" ? selectedDegree : undefined;
      const deptParam = selectedDept !== "all" ? selectedDept : undefined;
      const yearParam = selectedYear !== "all" ? Number(selectedYear) : undefined;
      const kindParam = selectedKind !== "all" ? selectedKind : undefined;
      const cameraParam = selectedCamera !== "all" ? selectedCamera : undefined;

      const [attRes, pRes] = await Promise.all([
        api.getAttendance({
          start: startDate,
          end: endDate,
          degree: degreeParam,
          department: deptParam,
          year: yearParam,
          kind: kindParam,
          cameraId: cameraParam,
          limit: 3000,
        }),
        api.getPersons(false),
      ]);

      setRecords(attRes);
      setPersons(pRes);

      // Attempt to load daily trend counts for the date range
      try {
        const counts = await api.getDailyCounts(
          startDate,
          endDate,
          degreeParam,
          deptParam,
          yearParam,
        );
        setDailyCounts(counts);
      } catch {
        // Fallback: derive daily counts from raw records
        const map = new Map<string, Set<number>>();
        attRes.forEach((r) => {
          if (r.kind === "check_in" && r.date) {
            if (!map.has(r.date)) map.set(r.date, new Set());
            map.get(r.date)!.add(r.person_id);
          }
        });
        const derived: DailyCount[] = Array.from(map.entries())
          .map(([date, set]) => ({ date, present: set.size }))
          .sort((a, b) => a.date.localeCompare(b.date));
        setDailyCounts(derived);
      }

      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error("Data Explorer error:", err);
      if (!quiet) toast.error("Failed to load monitoring data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [startDate, endDate, selectedDegree, selectedDept, selectedYear, selectedKind, selectedCamera]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh timer (every 20s if enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  // Map of Persons for enriched metadata
  const personMap = useMemo(() => {
    const map = new Map<number, Person>();
    persons.forEach((p) => map.set(p.id, p));
    return map;
  }, [persons]);

  // Enriched & filtered records for table & deep analytics
  const enrichedRecords = useMemo(() => {
    return records.map((r) => {
      const p = personMap.get(r.person_id);
      return {
        ...r,
        person_name: r.person_name || p?.name || `ID #${r.person_id}`,
        person_code: r.person_code || p?.code || "—",
        degree: r.degree || p?.degree || "",
        department: r.department || p?.department || "",
        year: r.year ?? p?.year ?? null,
      };
    });
  }, [records, personMap]);

  // Filtered by Search
  const searchFilteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return enrichedRecords;
    return enrichedRecords.filter(
      (r) =>
        r.person_name.toLowerCase().includes(q) ||
        r.person_code.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.degree.toLowerCase().includes(q) ||
        r.camera_id.toLowerCase().includes(q),
    );
  }, [enrichedRecords, searchQuery]);

  // Sorted Records for Table
  const sortedRecords = useMemo(() => {
    const copy = [...searchFilteredRecords];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "timestamp") {
        cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (sortField === "confidence") {
        cmp = (a.confidence || 0) - (b.confidence || 0);
      } else if (sortField === "name") {
        cmp = a.person_name.localeCompare(b.person_name);
      } else if (sortField === "dept") {
        cmp = a.department.localeCompare(b.department);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [searchFilteredRecords, sortField, sortOrder]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedRecords.length / pageSize) || 1;

  // --------------------------------------------------------------------------
  // EXECUTIVE KPIs & AGGREGATIONS
  // --------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalEnrolled = persons.length || 1;
    const uniqueAttendees = new Set(records.map((r) => r.person_id)).size;
    const turnoutRate = Math.min(100, Math.round((uniqueAttendees / totalEnrolled) * 100));

    const checkIns = records.filter((r) => r.kind === "check_in").length;
    const checkOuts = records.filter((r) => r.kind === "check_out").length;

    // Average confidence
    const confidences = records.map((r) => r.confidence).filter(Boolean);
    const avgConfidence = confidences.length
      ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
      : 88.5;

    // Hourly distribution computation (06:00 to 20:00)
    const hourlyCounts: { [hour: number]: { check_in: number; check_out: number } } = {};
    for (let h = 6; h <= 20; h++) {
      hourlyCounts[h] = { check_in: 0, check_out: 0 };
    }

    records.forEach((r) => {
      try {
        const d = new Date(r.timestamp);
        const h = d.getHours();
        if (hourlyCounts[h]) {
          if (r.kind === "check_out") hourlyCounts[h].check_out++;
          else hourlyCounts[h].check_in++;
        }
      } catch {
        // Ignore date parse issues
      }
    });

    // Peak hour
    let peakHour = 9;
    let maxHourlyCount = 0;
    Object.entries(hourlyCounts).forEach(([hStr, counts]) => {
      const sum = counts.check_in + counts.check_out;
      if (sum > maxHourlyCount) {
        maxHourlyCount = sum;
        peakHour = Number(hStr);
      }
    });

    // Department breakdown
    const deptMap: Record<string, { total: number; checkIns: number }> = {};
    records.forEach((r) => {
      const p = personMap.get(r.person_id);
      const dept = r.department || p?.department || "General";
      if (!deptMap[dept]) deptMap[dept] = { total: 0, checkIns: 0 };
      deptMap[dept].total++;
      if (r.kind === "check_in") deptMap[dept].checkIns++;
    });

    const deptBreakdown = Object.entries(deptMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);

    // Year breakdown
    const yearMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    records.forEach((r) => {
      const p = personMap.get(r.person_id);
      const yr = r.year ?? p?.year;
      if (yr && yearMap[yr] !== undefined) {
        yearMap[yr]++;
      }
    });

    // Camera breakdown
    const camMap: Record<string, number> = {};
    records.forEach((r) => {
      const cam = r.camera_id || "CAM_01";
      camMap[cam] = (camMap[cam] || 0) + 1;
    });

    return {
      uniqueAttendees,
      turnoutRate,
      totalEnrolled,
      totalEvents: records.length,
      checkIns,
      checkOuts,
      avgConfidence: avgConfidence.toFixed(1),
      peakHour: `${peakHour.toString().padStart(2, "0")}:00 – ${(peakHour + 1).toString().padStart(2, "0")}:00`,
      peakHourCount: maxHourlyCount,
      hourlyCounts,
      deptBreakdown,
      yearMap,
      camMap,
    };
  }, [records, persons, personMap]);

  // Export to CSV
  const handleExportCSV = () => {
    if (enrichedRecords.length === 0) {
      toast.error("No records available to export");
      return;
    }
    const headers = ["ID", "Timestamp", "Student_Code", "Name", "Degree", "Department", "Year", "Event_Type", "Camera_ID", "ArcFace_Confidence"];
    const rows = enrichedRecords.map((r) => [
      r.id,
      r.timestamp,
      `"${r.person_code}"`,
      `"${r.person_name}"`,
      `"${r.degree || ""}"`,
      `"${r.department || ""}"`,
      r.year ?? "",
      r.kind,
      r.camera_id,
      r.confidence ? (r.confidence * 100).toFixed(1) + "%" : "",
    ]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `NSCET_Attendance_Data_${startDate}_to_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exported attendance dataset to CSV");
  };

  // SVG Chart Dimensions for Daily Timeline
  const dailyTimelineData = useMemo(() => {
    if (dailyCounts.length > 0) return dailyCounts;
    // Default mock sequence if empty date
    return [
      { date: startDate, present: metrics.uniqueAttendees || 0 },
    ];
  }, [dailyCounts, startDate, metrics.uniqueAttendees]);

  const maxDailyPresent = Math.max(...dailyTimelineData.map((d) => d.present), 10);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ===================================================================== */}
      {/* 1. TOP HEADER & REAL-TIME CONTROLS BAR                                */}
      {/* ===================================================================== */}
      <Card className="border-v-border bg-surface shadow-xs rounded-2xl overflow-hidden">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft border border-primary/25 text-xs font-semibold text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>NSCET Analytics & Monitoring</span>
              </div>
              <h2 className="t-title font-bold text-text">
                Analytics & Daily Data Monitoring
              </h2>
              <p className="t-small text-text-muted">
                Multi-angle biometric attendance visualization, rush-hour volume, and department turnout metrics.
              </p>
            </div>

            {/* Quick Actions & Live Indicator */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Auto Refresh Toggle */}
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`h-9 px-3 rounded-xl border text-xs font-medium transition-all inline-flex items-center gap-2 cursor-pointer ${
                  autoRefresh
                    ? "bg-primary-soft border-primary/30 text-primary font-semibold"
                    : "bg-bg-page border-v-border text-text-muted hover:text-text hover:bg-surface"
                }`}
                title="Automatically refresh every 20 seconds"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    autoRefresh ? "bg-primary animate-ping" : "bg-text-faint"
                  }`}
                />
                <span>Live Feed {autoRefresh ? "Active" : "Paused"}</span>
              </button>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData(false)}
                disabled={isLoading || isRefreshing}
                className="h-9 px-3 text-xs font-semibold border-v-border bg-surface hover:bg-bg-page text-text gap-1.5 cursor-pointer rounded-xl"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? "animate-spin text-primary" : ""}`}
                  strokeWidth={1.75}
                />
                <span>Refresh</span>
              </Button>

              {/* CSV Export */}
              <Button
                onClick={handleExportCSV}
                size="sm"
                className="h-9 px-4 bg-primary hover:bg-primary-600 text-white text-xs font-semibold gap-1.5 rounded-xl shadow-xs cursor-pointer inline-flex items-center leading-none"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Export Dataset</span>
              </Button>
            </div>
          </div>

          {/* Preset Time Range Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-v-border">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-text-muted mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} /> Range:
              </span>
              {[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "7days", label: "Last 7 Days" },
                { id: "14days", label: "Last 14 Days" },
                { id: "30days", label: "Last 30 Days" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id as PresetRange)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    preset === p.id
                      ? "bg-primary text-white font-semibold shadow-xs"
                      : "bg-bg-page border border-v-border text-text hover:bg-surface hover:border-primary/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted font-medium">Custom:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset("custom");
                }}
                className="h-8 px-2.5 rounded-lg border border-v-border bg-bg-page text-text font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
              />
              <span className="text-text-muted">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset("custom");
                }}
                className="h-8 px-2.5 rounded-lg border border-v-border bg-bg-page text-text font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* 2. EXECUTIVE METRIC KPI CARDS                                         */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Turnout Rate */}
        <Card className="border-v-border bg-surface shadow-xs rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="t-eyebrow text-text-muted">Daily Turnout</span>
              <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                <UserCheck className="w-4 h-4" strokeWidth={1.75} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-text tabular-nums">
                  {metrics.turnoutRate}%
                </h3>
                <span className="text-xs text-primary font-semibold flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" />
                  {metrics.uniqueAttendees} present
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-1">
                Out of {metrics.totalEnrolled} enrolled roster
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Total Verification Events */}
        <Card className="border-v-border bg-surface shadow-xs rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="t-eyebrow text-text-muted">Verification Events</span>
              <div className="w-8 h-8 rounded-xl bg-bg-page border border-v-border text-primary flex items-center justify-center">
                <Activity className="w-4 h-4" strokeWidth={1.75} />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-text tabular-nums">
                {metrics.totalEvents.toLocaleString()}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                <span className="text-primary font-medium">{metrics.checkIns} Ins</span>
                <span>•</span>
                <span className="text-warning-text font-medium">{metrics.checkOuts} Outs</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Peak Arrival Window */}
        <Card className="border-v-border bg-surface shadow-xs rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="t-eyebrow text-text-muted">Rush-Hour Window</span>
              <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                <Clock className="w-4 h-4" strokeWidth={1.75} />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text font-mono truncate">
                {metrics.peakHour}
              </h3>
              <p className="text-[11px] text-primary font-semibold mt-1">
                {metrics.peakHourCount} peak face hits
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ArcFace Match Confidence */}
        <Card className="border-v-border bg-surface shadow-xs rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="t-eyebrow text-text-muted">Cosine Precision</span>
              <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-primary tabular-nums">
                  {metrics.avgConfidence}%
                </h3>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-soft text-primary uppercase">
                  512-D
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-1">
                Threshold: 0.65 (High Precision)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Gate Cameras Monitored */}
        <Card className="border-v-border bg-surface shadow-xs rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="t-eyebrow text-text-muted">Active Gate Feeds</span>
              <div className="w-8 h-8 rounded-xl bg-bg-page border border-v-border text-primary flex items-center justify-center">
                <Video className="w-4 h-4" strokeWidth={1.75} />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-text tabular-nums">
                {Object.keys(metrics.camMap).length || 3}
              </h3>
              <p className="text-[11px] text-primary font-medium mt-1">
                Real-time RTSP & Webcams
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===================================================================== */}
      {/* 3. VISUALIZATION WORKBENCH (CHARTS & DISTRIBUTION)                     */}
      {/* ===================================================================== */}
      <Card className="border-v-border bg-surface shadow-md rounded-2xl overflow-hidden">
        {/* Visualization Tabs Header */}
        <div className="p-4 border-b border-v-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">
                Biometric Identity Traffic Analytics
              </h3>
              <p className="text-[11px] text-text-muted">
                Select visual breakdown perspective
              </p>
            </div>
          </div>

          {/* Sub-view Nav Controls */}
          <div className="flex items-center gap-1 p-1 bg-bg-page rounded-xl border border-v-border overflow-x-auto">
            {[
              { id: "trends", label: "Daily Trend", icon: TrendingUp },
              { id: "hourly", label: "Hourly Distribution", icon: Clock },
              { id: "departments", label: "Departments", icon: Layers },
              { id: "years", label: "Academic Year", icon: PieChart },
              { id: "cameras", label: "Gate Feeds", icon: Video },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeVizTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveVizTab(tab.id as MetricTab)}
                  className={`h-7 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-surface text-primary font-semibold shadow-xs border border-v-border"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Workbench Body */}
        <div className="p-6">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="space-y-3 text-center">
                <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
                <p className="text-xs text-text-muted font-medium">Aggregating attendance telemetry...</p>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: DAILY TREND (SVG Area + Columns) */}
              {activeVizTab === "trends" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">
                      Daily Unique Identity Attendance Trend ({startDate} to {endDate})
                    </span>
                    <span className="text-text-muted">
                      Peak: <strong className="text-primary">{maxDailyPresent} Attendees</strong>
                    </span>
                  </div>

                  {/* SVG Area & Bar Visualizer */}
                  <div className="relative h-64 w-full bg-bg-page/60 rounded-2xl border border-v-border p-4 flex flex-col justify-end">
                    {/* Hover Tooltip */}
                    {hoveredDay && (
                      <div
                        className="absolute z-20 pointer-events-none px-3 py-1.5 rounded-xl bg-sidebar-bg text-white shadow-xl text-xs space-y-0.5 border border-white/10"
                        style={{
                          left: `${Math.min(85, Math.max(10, hoveredDay.x))}%`,
                          bottom: "75%",
                        }}
                      >
                        <p className="font-bold text-[11px] text-primary-soft">{hoveredDay.date}</p>
                        <p className="font-semibold text-white">{hoveredDay.count} Unique Attendees</p>
                      </div>
                    )}

                    {/* Chart Columns & Area Line */}
                    <div className="h-44 w-full flex items-end justify-between gap-2 pt-4 px-2">
                      {dailyTimelineData.map((d, idx) => {
                        const heightPct = Math.max(8, Math.round((d.present / maxDailyPresent) * 100));
                        const isHovered = hoveredDay?.date === d.date;
                        return (
                          <div
                            key={d.date}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                              const x = rect ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
                              setHoveredDay({ date: d.date, count: d.present, x, y: 0 });
                            }}
                            onMouseLeave={() => setHoveredDay(null)}
                            className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer relative"
                          >
                            <span className="text-[10px] font-mono text-text-muted mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {d.present}
                            </span>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full max-w-[42px] rounded-t-xl transition-all duration-300 ${
                                isHovered
                                  ? "bg-primary shadow-md ring-2 ring-primary/30"
                                  : "bg-primary/80 group-hover:bg-primary"
                              }`}
                            />
                            <span className="text-[10px] font-mono text-text-muted mt-2 truncate w-full text-center">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: HOURLY RUSH-HOUR DISTRIBUTION */}
              {activeVizTab === "hourly" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">
                      Intra-Day Flow (06:00 to 20:00) — Morning Arrivals vs Evening Departures
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-primary font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Check-Ins
                      </span>
                      <span className="flex items-center gap-1.5 text-warning-text font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-warning" /> Check-Outs
                      </span>
                    </div>
                  </div>

                  <div className="h-64 w-full bg-bg-page/60 rounded-2xl border border-v-border p-4 flex flex-col justify-end">
                    <div className="h-44 w-full flex items-end justify-between gap-1.5 pt-4 px-2">
                      {Object.entries(metrics.hourlyCounts).map(([hStr, c]) => {
                        const h = Number(hStr);
                        const totalHour = c.check_in + c.check_out;
                        const maxVal = Math.max(1, metrics.peakHourCount);
                        const inPct = Math.round((c.check_in / maxVal) * 100);
                        const outPct = Math.round((c.check_out / maxVal) * 100);
                        const isPeak = h === Number(metrics.peakHour.split(":")[0]);

                        return (
                          <div
                            key={h}
                            onMouseEnter={() => setHoveredHour(h)}
                            onMouseLeave={() => setHoveredHour(null)}
                            className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer relative"
                          >
                            {/* Hover info badge */}
                            {hoveredHour === h && (
                              <div className="absolute -top-12 z-20 px-2 py-1 bg-sidebar-bg text-white rounded-lg text-[10px] whitespace-nowrap shadow-lg">
                                {c.check_in} In / {c.check_out} Out
                              </div>
                            )}

                            {/* Dual stacked / paired bars */}
                            <div className="w-full flex items-end justify-center gap-0.5 h-full">
                              <div
                                style={{ height: `${Math.max(4, inPct)}%` }}
                                className={`w-1/2 max-w-[14px] rounded-t-md transition-all ${
                                  isPeak ? "bg-primary ring-2 ring-primary/40" : "bg-primary/80 group-hover:bg-primary"
                                }`}
                              />
                              <div
                                style={{ height: `${Math.max(4, outPct)}%` }}
                                className="w-1/2 max-w-[14px] rounded-t-md bg-warning/80 group-hover:bg-warning transition-all"
                              />
                            </div>

                            <span className={`text-[10px] font-mono mt-2 ${isPeak ? "font-bold text-primary" : "text-text-muted"}`}>
                              {hStr}h
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: DEPARTMENT BREAKDOWN */}
              {activeVizTab === "departments" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">
                      Attendance Distribution across Academic Departments
                    </span>
                    <span className="text-text-muted font-medium">
                      {metrics.deptBreakdown.length} Programs Participating
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {metrics.deptBreakdown.map((dept) => {
                      const pct = Math.round((dept.total / (metrics.totalEvents || 1)) * 100);
                      return (
                        <div
                          key={dept.name}
                          className="p-4 rounded-xl border border-v-border bg-bg-page/50 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-text">{dept.name}</span>
                            <span className="font-mono text-xs font-semibold text-primary">{dept.total} records ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-v-border overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className="h-full bg-primary rounded-full transition-all duration-500"
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-text-muted">
                            <span>Check-in entries: {dept.checkIns}</span>
                            <span>Turnout share: {pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: ACADEMIC YEAR DISTRIBUTION */}
              {activeVizTab === "years" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">
                      Academic Year Attendance Proportion (1st Year to 4th Year)
                    </span>
                    <span className="text-text-muted">4-Year Curriculum</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {ACADEMIC_YEARS.map((yr) => {
                      const count = metrics.yearMap[yr.value] || 0;
                      const pct = Math.round((count / (metrics.totalEvents || 1)) * 100);
                      return (
                        <div
                          key={yr.value}
                          className="p-5 rounded-2xl border border-v-border bg-bg-page/60 space-y-3 text-center"
                        >
                          <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary font-bold text-sm flex items-center justify-center mx-auto shadow-xs">
                            {yr.roman}
                          </div>
                          <div>
                            <h4 className="font-bold text-text text-sm">{yr.label}</h4>
                            <p className="text-xs text-text-muted mt-0.5">{yr.short}</p>
                          </div>
                          <div className="pt-2 border-t border-v-border">
                            <p className="text-xl font-bold text-primary tabular-nums">{count}</p>
                            <p className="text-[11px] text-text-muted">{pct}% of records</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 5: GATE CAMERAS FLOW */}
              {activeVizTab === "cameras" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">
                      Campus Gate Throughput & Camera Load Balancing
                    </span>
                    <span className="text-text-muted">Real-Time Capture Points</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.entries(metrics.camMap).map(([camId, count]) => {
                      const pct = Math.round((count / (metrics.totalEvents || 1)) * 100);
                      return (
                        <div
                          key={camId}
                          className="p-5 rounded-2xl border border-v-border bg-bg-page/60 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Video className="w-4 h-4 text-primary" strokeWidth={1.75} />
                              <span className="font-bold text-sm text-text font-mono">{camId}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary font-bold text-[10px]">
                              Active
                            </span>
                          </div>
                          <div>
                            <h4 className="text-2xl font-bold text-text tabular-nums">{count}</h4>
                            <p className="text-xs text-text-muted mt-0.5">{pct}% total gate passage</p>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-v-border overflow-hidden">
                            <div style={{ width: `${pct}%` }} className="h-full bg-primary rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* 4. INTERACTIVE DATA EXPLORER & DEEP DIVE TABLE                        */}
      {/* ===================================================================== */}
      <Card className="border-v-border bg-surface shadow-md rounded-2xl overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-v-border bg-surface space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                <Filter className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">
                  Attendance Telemetry Explorer
                </h3>
                <p className="text-[11px] text-text-muted">
                  Filter and inspect raw ArcFace recognition events
                </p>
              </div>
            </div>

            {/* Live Search */}
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
              <Input
                placeholder="Search by name, ID code, degree..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-8 h-8 py-0 text-xs bg-bg-page border-v-border text-text placeholder:text-text-faint rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-muted hover:text-text"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Filtering Dropdown Controls */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Degree Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap">Degree:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDegree}
                  onChange={(e) => {
                    setSelectedDegree(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-2.5 pr-7 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">All Degrees</option>
                  {DEGREE_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2 pointer-events-none" />
              </div>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap">Dept:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-2.5 pr-7 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">All Departments</option>
                  {getDepartmentsForDegree(selectedDegree !== "all" ? selectedDegree : undefined).map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2 pointer-events-none" />
              </div>
            </div>

            {/* Academic Year Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap">Year:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-2.5 pr-7 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">All Years</option>
                  {ACADEMIC_YEARS.map((yr) => (
                    <option key={yr.value} value={String(yr.value)}>{yr.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2 pointer-events-none" />
              </div>
            </div>

            {/* Event Kind Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap">Event:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedKind}
                  onChange={(e) => {
                    setSelectedKind(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-2.5 pr-7 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">All Events</option>
                  <option value="check_in">Check-In Only</option>
                  <option value="check_out">Check-Out Only</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2 pointer-events-none" />
              </div>
            </div>

            <span className="text-xs text-text-muted font-medium ml-auto whitespace-nowrap">
              Showing <strong className="text-text">{sortedRecords.length}</strong> of{" "}
              <strong className="text-text">{records.length}</strong> records
            </span>
          </div>
        </div>

        {/* Data Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bg-page/70 text-text-muted border-b border-v-border font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th
                  onClick={() => {
                    setSortField("timestamp");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  className="p-3.5 pl-6 cursor-pointer hover:text-text select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Timestamp & Date</span>
                    <ArrowUpDown className="w-3 h-3 text-text-faint" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortField("name");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  className="p-3.5 cursor-pointer hover:text-text select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Personnel / Student</span>
                    <ArrowUpDown className="w-3 h-3 text-text-faint" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortField("dept");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  className="p-3.5 cursor-pointer hover:text-text select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Program & Year</span>
                    <ArrowUpDown className="w-3 h-3 text-text-faint" />
                  </div>
                </th>
                <th className="p-3.5">Event Kind</th>
                <th className="p-3.5">Gate / Camera</th>
                <th
                  onClick={() => {
                    setSortField("confidence");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  className="p-3.5 pr-6 cursor-pointer hover:text-text select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>ArcFace Score</span>
                    <ArrowUpDown className="w-3 h-3 text-text-faint" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-v-border">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-3.5 pl-6"><Skeleton className="h-4 w-28 rounded" /></td>
                    <td className="p-3.5"><Skeleton className="h-4 w-36 rounded" /></td>
                    <td className="p-3.5"><Skeleton className="h-4 w-24 rounded" /></td>
                    <td className="p-3.5"><Skeleton className="h-4 w-16 rounded" /></td>
                    <td className="p-3.5"><Skeleton className="h-4 w-20 rounded" /></td>
                    <td className="p-3.5 pr-6"><Skeleton className="h-4 w-12 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-text-muted">
                    <div className="space-y-2">
                      <Search className="w-8 h-8 text-text-faint mx-auto" />
                      <p className="font-semibold text-sm text-text">No attendance records match this query</p>
                      <p className="text-xs">Try adjusting your date range, department, or search filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((r) => {
                  const confPct = r.confidence ? Math.round(r.confidence * 100) : 88;
                  const isCheckIn = r.kind === "check_in";
                  const formattedTime = new Date(r.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const formattedDate = new Date(r.timestamp).toISOString().slice(0, 10);

                  return (
                    <tr key={r.id} className="hover:bg-bg-page/60 transition-colors">
                      {/* Timestamp & Date */}
                      <td className="p-3.5 pl-6">
                        <div className="font-mono text-xs text-text font-semibold">
                          {formattedTime}
                        </div>
                        <div className="text-[11px] text-text-muted font-mono">
                          {formattedDate}
                        </div>
                      </td>

                      {/* Personnel */}
                      <td className="p-3.5">
                        <div className="font-semibold text-text text-sm">
                          {r.person_name}
                        </div>
                        <div className="text-[11px] font-mono text-text-muted">
                          {r.person_code}
                        </div>
                      </td>

                      {/* Program & Year */}
                      <td className="p-3.5">
                        <span className="font-medium text-text">
                          {formatProgram(r.degree, r.department, r.year)}
                        </span>
                      </td>

                      {/* Event Kind */}
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isCheckIn
                              ? "bg-primary-soft text-primary border border-primary/20"
                              : "bg-warning-soft text-warning-text border border-warning/20"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isCheckIn ? "bg-primary" : "bg-warning"}`} />
                          {isCheckIn ? "Check-In" : "Check-Out"}
                        </span>
                      </td>

                      {/* Camera Gate */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 text-text-muted font-mono text-xs">
                          <Video className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>{r.camera_id}</span>
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="p-3.5 pr-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-v-border rounded-full overflow-hidden hidden sm:block">
                            <div
                              style={{ width: `${confPct}%` }}
                              className={`h-full rounded-full ${
                                confPct >= 85 ? "bg-primary" : confPct >= 70 ? "bg-warning" : "bg-danger"
                              }`}
                            />
                          </div>
                          <span className="font-mono font-bold text-text tabular-nums">
                            {confPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-v-border bg-surface flex items-center justify-between text-xs text-text-muted">
            <span>
              Page <strong className="text-text">{currentPage}</strong> of <strong className="text-text">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-2.5 text-xs border-v-border cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-2.5 text-xs border-v-border cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
