import React, { useEffect, useState, useMemo } from "react";
import { api, AttendanceRecord, Person } from "@/lib/api";
import {
  COLLEGE_NAME,
  COLLEGE_SHORT_NAME,
  COLLEGE_LOGO_PATH,
  COLLEGE_PROGRAMS,
  DEGREE_OPTIONS,
  ACADEMIC_YEARS,
  formatProgram,
  getDepartmentsForDegree,
} from "@/lib/college";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Download,
  Calendar,
  Users,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  FileSpreadsheet,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileText,
  Printer,
  X,
  Camera,
  ShieldCheck,
} from "lucide-react";

type SortField = "timestamp" | "person_name" | "confidence" | "kind";
type SortOrder = "asc" | "desc";

export function AttendanceView({
  refreshTrigger,
}: {
  refreshTrigger?: number;
}) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Search & Filter
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<
    "all" | "check_in" | "check_out"
  >("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedDegree, setSelectedDegree] = useState<string>("all");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Debounce search input (200ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Reset department if not valid for selected degree
  useEffect(() => {
    if (selectedDegree !== "all") {
      const allowedDepts = getDepartmentsForDegree(selectedDegree);
      if (selectedDept !== "all" && !allowedDepts.includes(selectedDept)) {
        setSelectedDept("all");
      }
    }
  }, [selectedDegree, selectedDept]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [attRes, pRes] = await Promise.all([
        api.getAttendance({ limit: 1500 }),
        api.getPersons(false),
      ]);
      setRecords(attRes);
      setPersons(pRes);
    } catch (err: any) {
      console.error("Failed to load attendance records:", err);
      toast.error("Failed to fetch attendance records");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  // Map person ID to Person object for degree & department resolution
  const personMap = useMemo(() => {
    const map = new Map<number, Person>();
    persons.forEach((p) => {
      map.set(p.id, p);
    });
    return map;
  }, [persons]);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const q = debouncedSearch.toLowerCase().trim();
      const p = personMap.get(r.person_id);
      const degree = (r.degree || p?.degree || "").trim();
      const dept = (r.department || p?.department || "").trim();
      const year = r.year ?? p?.year;

      const matchesSearch =
        q === "" ||
        r.person_name.toLowerCase().includes(q) ||
        r.person_code.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q) ||
        degree.toLowerCase().includes(q);

      const matchesKind = kindFilter === "all" || r.kind === kindFilter;
      const matchesDate = dateFilter === "" || r.date === dateFilter;
      const matchesDegree =
        selectedDegree === "all" || degree === selectedDegree;
      const matchesDept = selectedDept === "all" || dept === selectedDept;
      const matchesYear =
        selectedYear === "all" ||
        (year !== undefined && year !== null && String(year) === selectedYear);

      return (
        matchesSearch &&
        matchesKind &&
        matchesDate &&
        matchesDegree &&
        matchesDept &&
        matchesYear
      );
    });
  }, [
    records,
    debouncedSearch,
    kindFilter,
    dateFilter,
    selectedDegree,
    selectedDept,
    selectedYear,
    personMap,
  ]);

  // Sort records
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      let result = 0;
      if (sortField === "timestamp") {
        result =
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (sortField === "person_name") {
        result = a.person_name.localeCompare(b.person_name);
      } else if (sortField === "confidence") {
        result = a.confidence - b.confidence;
      } else if (sortField === "kind") {
        result = a.kind.localeCompare(b.kind);
      }
      return sortOrder === "asc" ? result : -result;
    });
  }, [filteredRecords, sortField, sortOrder]);

  // Paginate records
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = filteredRecords.length;
    const checkIns = filteredRecords.filter(
      (r) => r.kind === "check_in",
    ).length;
    const checkOuts = filteredRecords.filter(
      (r) => r.kind === "check_out",
    ).length;
    const uniquePersons = new Set(filteredRecords.map((r) => r.person_id)).size;
    const avgConfidence =
      total > 0
        ? Math.round(
            (filteredRecords.reduce((acc, curr) => acc + curr.confidence, 0) /
              total) *
              100,
          )
        : 0;

    return { total, checkIns, checkOuts, uniquePersons, avgConfidence };
  }, [filteredRecords]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    if (format === "csv") setIsExportingCsv(true);
    else setIsExportingXlsx(true);

    try {
      const url = api.getExportUrl(format, {
        degree: selectedDegree !== "all" ? selectedDegree : undefined,
        department: selectedDept !== "all" ? selectedDept : undefined,
        year: selectedYear !== "all" ? Number(selectedYear) : undefined,
        kind: kindFilter !== "all" ? kindFilter : undefined,
        start: dateFilter || undefined,
        end: dateFilter || undefined,
      });
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance_${selectedDegree !== "all" ? selectedDegree + "_" : ""}${
        selectedDept !== "all" ? selectedDept + "_" : ""
      }${selectedYear !== "all" ? "Year" + selectedYear + "_" : ""}${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(
        `Exported ${filteredRecords.length} records as ${format.toUpperCase()}`,
      );
    } catch {
      toast.error(`Failed to export ${format.toUpperCase()}`);
    } finally {
      if (format === "csv") setIsExportingCsv(false);
      else setIsExportingXlsx(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // Available departments based on selected degree
  const availableDepts = useMemo(() => {
    if (selectedDegree === "all") {
      return Array.from(
        new Set([...COLLEGE_PROGRAMS["BE"], ...COLLEGE_PROGRAMS["B.Tech"]]),
      );
    }
    return getDepartmentsForDegree(selectedDegree);
  }, [selectedDegree]);

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 4 High-Density KPI Cards */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Events */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Total Logs
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-text tabular-nums">
                    {metrics.total.toLocaleString()}
                  </h3>
                  <span className="t-small text-text-muted font-medium whitespace-nowrap">
                    filtered
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bg-page border border-v-border flex items-center justify-center text-primary shrink-0">
              <Clock className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Check-Ins */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Check-Ins
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-primary tabular-nums">
                    {metrics.checkIns.toLocaleString()}
                  </h3>
                  <span className="t-small text-primary font-medium flex items-center gap-0.5 whitespace-nowrap">
                    <TrendingUp className="w-3 h-3 inline" strokeWidth={1.75} />
                    {metrics.total > 0
                      ? `${Math.round((metrics.checkIns / metrics.total) * 100)}%`
                      : "0%"}
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <LogIn className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Check-Outs */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-warning/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Check-Outs
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-warning-text tabular-nums">
                    {metrics.checkOuts.toLocaleString()}
                  </h3>
                  <span className="t-small text-warning-text font-medium whitespace-nowrap">
                    {metrics.total > 0
                      ? `${Math.round((metrics.checkOuts / metrics.total) * 100)}%`
                      : "0%"}
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-warning-soft border border-warning/30 flex items-center justify-center text-warning-text shrink-0">
              <LogOut className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Unique Personnel Sighted */}
        <Card className="border-v-border bg-surface shadow-xs hover:border-primary/40 transition-colors rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="t-eyebrow text-text-muted">
                Present Individuals
              </span>
              {isLoading ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <h3 className="t-kpi text-text tabular-nums">
                    {metrics.uniquePersons.toLocaleString()}
                  </h3>
                  <span className="t-small text-text-muted font-medium whitespace-nowrap">
                    avg {metrics.avgConfidence}%
                  </span>
                </div>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bg-page border border-v-border flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* Attendance Table with Degree/Department Filters & Print Action */}
      {/* ========================================================================= */}
      <Card className="border-v-border bg-surface shadow-md overflow-hidden rounded-2xl">
        {/* Filter Bar */}
        <div className="p-4 border-b border-v-border bg-surface space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0">
                <Calendar className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="t-title font-bold text-text leading-tight truncate">
                    Attendance Verification Ledger
                  </h2>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary/25 text-[10px] font-semibold">
                    <ShieldCheck className="w-3 h-3 text-primary" strokeWidth={2} />
                    <span>End-to-End Encrypted</span>
                  </span>
                </div>
                <p className="t-small text-text-muted mt-0.5 leading-snug">
                  Audit trail with biometric confidence, entrance camera IDs, and exact timestamps
                </p>
              </div>
            </div>

            {/* Actions: Print, Refresh & Exports */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPrintModalOpen(true)}
                disabled={filteredRecords.length === 0}
                className="h-8 px-3 text-xs font-medium border-v-border bg-surface hover:bg-surface-elevated text-text inline-flex items-center justify-center gap-1.5 cursor-pointer leading-none"
                title="Printable Attendance Sheet"
              >
                <Printer className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                <span>Print</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("csv")}
                disabled={isExportingCsv || filteredRecords.length === 0}
                className="h-8 px-3 text-xs font-medium border-v-border bg-surface hover:bg-surface-elevated text-text inline-flex items-center justify-center gap-1.5 cursor-pointer leading-none"
              >
                <Download
                  className={`w-3.5 h-3.5 shrink-0 ${isExportingCsv ? "animate-bounce" : ""}`}
                  strokeWidth={1.75}
                />
                <span>CSV</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("xlsx")}
                disabled={isExportingXlsx || filteredRecords.length === 0}
                className="h-8 px-3 text-xs font-medium border-v-border bg-surface hover:bg-surface-elevated text-text inline-flex items-center justify-center gap-1.5 cursor-pointer leading-none"
              >
                <FileSpreadsheet
                  className={`w-3.5 h-3.5 shrink-0 ${isExportingXlsx ? "animate-bounce" : ""}`}
                  strokeWidth={1.75}
                />
                <span>Excel</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={isLoading}
                className="h-8 px-3 text-xs font-medium border-v-border bg-surface hover:bg-surface-elevated text-text inline-flex items-center justify-center gap-1.5 cursor-pointer leading-none"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isLoading ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Filtering Controls Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none shrink-0" strokeWidth={1.75} />
              <Input
                placeholder="Search by name, ID code, degree, or department..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-14 h-8 py-0 leading-[30px] text-xs bg-bg-page border-v-border text-text placeholder:text-text-faint placeholder:leading-[30px] rounded-xl"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-text-muted hover:text-text cursor-pointer px-1 py-0.5 rounded leading-none"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Degree Dependent Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap leading-none flex items-center">
                Degree:
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDegree}
                  onChange={(e) => {
                    setSelectedDegree(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  <option value="all">All Degrees</option>
                  {DEGREE_OPTIONS.map((deg: string) => (
                    <option key={deg} value={deg}>
                      {deg}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0" strokeWidth={1.75} />
              </div>
            </div>

            {/* Department Dependent Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-muted whitespace-nowrap leading-none flex items-center">
                Department:
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  <option value="all">All Departments</option>
                  {availableDepts.map((d: string) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0" strokeWidth={1.75} />
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
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-8 pl-3 pr-8 py-0 rounded-xl bg-bg-page border border-v-border text-xs text-text font-medium leading-[30px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  <option value="all">All Years</option>
                  {ACADEMIC_YEARS.map((yr) => (
                    <option key={yr.value} value={yr.value}>
                      {yr.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2.5 pointer-events-none shrink-0" strokeWidth={1.75} />
              </div>
            </div>

            {/* Event Kind Segmented Control */}
            <div className="h-8 p-0.5 rounded-xl border border-v-border bg-bg-page inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  setKindFilter("all");
                  setCurrentPage(1);
                }}
                className={`h-full px-3 inline-flex items-center justify-center rounded-lg text-xs font-medium leading-none transition-all cursor-pointer ${
                  kindFilter === "all"
                    ? "bg-surface text-text shadow-xs font-semibold"
                    : "text-text-muted hover:text-text"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setKindFilter("check_in");
                  setCurrentPage(1);
                }}
                className={`h-full px-3 inline-flex items-center justify-center rounded-lg text-xs font-medium leading-none transition-all cursor-pointer ${
                  kindFilter === "check_in"
                    ? "bg-primary-soft text-primary border border-primary/30 shadow-xs font-semibold"
                    : "text-text-muted hover:text-text"
                }`}
              >
                In
              </button>
              <button
                type="button"
                onClick={() => {
                  setKindFilter("check_out");
                  setCurrentPage(1);
                }}
                className={`h-full px-3 inline-flex items-center justify-center rounded-lg text-xs font-medium leading-none transition-all cursor-pointer ${
                  kindFilter === "check_out"
                    ? "bg-warning-soft text-warning-text border border-warning/30 shadow-xs font-semibold"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Out
              </button>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-auto h-8 py-0 px-2.5 text-xs font-mono bg-bg-page border-v-border rounded-xl text-text leading-[30px]"
              />
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateFilter("")}
                  className="text-xs h-8 text-text-muted hover:text-text px-2 cursor-pointer inline-flex items-center leading-none"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bg-page/75 border-b border-v-border text-xs uppercase tracking-wider font-semibold text-text-muted select-none">
              <tr>
                <th
                  onClick={() => handleSort("person_name")}
                  className="px-5 py-3 cursor-pointer hover:text-text align-middle"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Identity</span>
                    {sortField === "person_name" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-40 shrink-0" strokeWidth={1.75} />
                    )}
                  </div>
                </th>

                <th className="px-5 py-3 align-middle">Degree & Dept</th>

                <th
                  onClick={() => handleSort("kind")}
                  className="px-5 py-3 cursor-pointer hover:text-text align-middle"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Event</span>
                    {sortField === "kind" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-40 shrink-0" strokeWidth={1.75} />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort("timestamp")}
                  className="px-5 py-3 cursor-pointer hover:text-text align-middle"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Timestamp</span>
                    {sortField === "timestamp" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-40 shrink-0" strokeWidth={1.75} />
                    )}
                  </div>
                </th>

                <th className="px-5 py-3 align-middle">Camera Node</th>

                <th
                  onClick={() => handleSort("confidence")}
                  className="px-5 py-3 cursor-pointer hover:text-text align-middle"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Recognition</span>
                    {sortField === "confidence" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-40 shrink-0" strokeWidth={1.75} />
                    )}
                  </div>
                </th>

                <th className="px-5 py-3 text-center w-16 align-middle">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-v-border">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4 align-middle">
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-32 rounded" />
                        <Skeleton className="h-3 w-16 rounded" />
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <Skeleton className="h-5 w-24 rounded" />
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <Skeleton className="h-4 w-28 rounded" />
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <Skeleton className="h-4 w-20 rounded" />
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <Skeleton className="h-4 w-24 rounded" />
                    </td>
                    <td className="px-5 py-4 text-center align-middle">
                      <Skeleton className="h-6 w-6 rounded mx-auto" />
                    </td>
                  </tr>
                ))
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-text-muted">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-bg-page border border-v-border flex items-center justify-center text-text-muted">
                        <FileText className="w-6 h-6" strokeWidth={1.75} />
                      </div>
                      <div className="space-y-1">
                        <p className="t-body font-semibold text-text">
                          No attendance records found
                        </p>
                        <p className="t-small text-text-muted">
                          {searchInput ||
                          dateFilter ||
                          selectedDegree !== "all" ||
                          selectedDept !== "all" ||
                          selectedYear !== "all" ||
                          kindFilter !== "all"
                            ? "Try adjusting your degree, department, year, or keyword filters."
                            : "New records will automatically populate once recognized by the live scanner or entrance camera."}
                        </p>
                      </div>
                      {(searchInput ||
                        dateFilter ||
                        selectedDegree !== "all" ||
                        selectedDept !== "all" ||
                        selectedYear !== "all" ||
                        kindFilter !== "all") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchInput("");
                            setDateFilter("");
                            setSelectedDegree("all");
                            setSelectedDept("all");
                            setSelectedYear("all");
                            setKindFilter("all");
                          }}
                          className="t-small border-v-border bg-surface text-text cursor-pointer"
                        >
                          Clear All Filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((r) => {
                  const isCheckIn = r.kind === "check_in";
                  const p = personMap.get(r.person_id);
                  const degree = r.degree || p?.degree || null;
                  const dept = r.department || p?.department || null;
                  const year = r.year ?? p?.year;
                  const programLabel = formatProgram(degree, dept);
                  const pct = Math.min(100, Math.round(r.confidence * 100));
                  const isExpanded = expandedRowId === r.id;

                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() =>
                          setExpandedRowId(isExpanded ? null : r.id)
                        }
                        className={`hover:bg-bg-page/70 transition-colors cursor-pointer ${
                          isExpanded ? "bg-bg-page/80" : ""
                        }`}
                      >
                        {/* Column 1: Identity */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="text-sm font-semibold text-text leading-tight truncate">
                            {r.person_name}
                          </div>
                          <div className="text-xs font-mono text-text-muted leading-tight truncate mt-1 flex items-center gap-1">
                            <span className="text-text-faint text-[10px]">ID:</span>
                            <span>{r.person_code}</span>
                          </div>
                        </td>

                        {/* Column 2: Program & Year Badges */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="h-6 px-2.5 inline-flex items-center rounded-md bg-bg-page border border-v-border text-xs font-mono font-semibold text-text whitespace-nowrap leading-none">
                              {programLabel}
                            </span>
                            {year && (
                              <span className="h-6 px-2 inline-flex items-center rounded-md bg-primary-soft text-primary border border-primary/25 text-[11px] font-semibold whitespace-nowrap leading-none">
                                Yr {year}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Column 3: Event Type Pill */}
                        <td className="px-5 py-3.5 align-middle">
                          <span
                            className={`h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap leading-none ${
                              isCheckIn
                                ? "bg-primary-soft text-primary border border-primary/25"
                                : "bg-warning-soft text-warning-text border border-warning/30"
                            }`}
                          >
                            {isCheckIn ? (
                              <LogIn className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                            ) : (
                              <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                            )}
                            <span>{isCheckIn ? "Check-In" : "Check-Out"}</span>
                          </span>
                        </td>

                        {/* Column 4: Timestamp */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="text-sm font-medium text-text leading-tight">
                            {r.date}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-text-muted leading-tight mt-1">
                            {formatTime(r.timestamp)}
                          </div>
                        </td>

                        {/* Column 5: Camera Node Badge */}
                        <td className="px-5 py-3.5 align-middle">
                          <span className="h-6 px-2.5 inline-flex items-center gap-1 rounded-md bg-bg-page border border-v-border text-xs font-mono font-medium text-text-muted whitespace-nowrap leading-none">
                            <Camera className="w-3 h-3 text-text-faint shrink-0" strokeWidth={1.75} />
                            <span>{r.camera_id}</span>
                          </span>
                        </td>

                        {/* Column 6: Recognition Score */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="h-6 inline-flex items-center gap-2.5">
                            <div className="w-16 bg-bg-page rounded-full h-1.5 overflow-hidden border border-v-border shrink-0">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 75
                                    ? "bg-primary"
                                    : pct >= 55
                                      ? "bg-primary-600"
                                      : "bg-warning"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono font-semibold text-text tabular-nums w-11 text-right shrink-0 leading-none">
                              {pct}%
                            </span>
                          </div>
                        </td>

                        {/* Column 7: Expand Toggle */}
                        <td className="px-5 py-3.5 text-center align-middle">
                          <button
                            type="button"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-bg-page transition-colors cursor-pointer"
                            aria-label="Expand row details"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                            ) : (
                              <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Row Details */}
                      {isExpanded && (
                        <tr className="bg-bg-page/50 border-b border-v-border">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div className="p-3.5 rounded-xl bg-surface border border-v-border space-y-1">
                                <span className="t-eyebrow text-text-muted">
                                  Face Recognition Verification
                                </span>
                                <p className="font-semibold text-text t-body flex items-baseline gap-1.5">
                                  <span>Confidence Metric:</span>
                                  <span className="font-mono tabular-nums text-primary font-bold">{(r.confidence * 100).toFixed(2)}%</span>
                                </p>
                                <p className="t-small text-text-muted">
                                  Program: {programLabel}
                                  {year ? ` • Year ${year}` : ""}
                                </p>
                              </div>

                              <div className="p-3.5 rounded-xl bg-surface border border-v-border space-y-1">
                                <span className="t-eyebrow text-text-muted">
                                  Camera Node Details
                                </span>
                                <p className="font-semibold text-text flex items-center gap-1.5 t-body">
                                  <Camera className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />{" "}
                                  <span>{r.camera_id}</span>
                                </p>
                                <p className="t-small text-text-muted font-mono">
                                  Record ID: #{r.id} • Person Code:{" "}
                                  {r.person_code}
                                </p>
                              </div>

                              <div className="p-3.5 rounded-xl bg-surface border border-v-border space-y-1">
                                <span className="t-eyebrow text-text-muted">
                                  Institutional Log Entry
                                </span>
                                <p className="font-semibold text-text font-mono tabular-nums t-body">
                                  {r.timestamp}
                                </p>
                                <p className="t-small text-text-muted">
                                  Recorded to institutional attendance database
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Summary Footer */}
        <div className="p-4 border-t border-v-border bg-surface flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-3">
            <span className="leading-none flex items-center gap-1">
              Showing{" "}
              <strong className="text-text tabular-nums font-semibold">
                {sortedRecords.length > 0
                  ? (currentPage - 1) * pageSize + 1
                  : 0}
              </strong>{" "}
              to{" "}
              <strong className="text-text tabular-nums font-semibold">
                {Math.min(currentPage * pageSize, sortedRecords.length)}
              </strong>{" "}
              of{" "}
              <strong className="text-text tabular-nums font-semibold">
                {sortedRecords.length}
              </strong>{" "}
              results
            </span>

            {/* Page Size Select */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="whitespace-nowrap leading-none flex items-center">Per page:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="appearance-none h-7 pl-2.5 pr-6 py-0 rounded-lg bg-bg-page border border-v-border text-text text-xs font-semibold leading-[26px] cursor-pointer focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <ChevronDown className="w-3 h-3 text-text-muted absolute right-1.5 pointer-events-none shrink-0" strokeWidth={1.75} />
              </div>
            </div>
          </div>

          {/* Page Switcher */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 inline-flex items-center justify-center border-v-border bg-surface text-text-muted hover:text-text rounded-lg cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            </Button>

            <span className="px-2 font-mono text-xs text-text tabular-nums font-semibold leading-none flex items-center">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 inline-flex items-center justify-center border-v-border bg-surface text-text-muted hover:text-text rounded-lg cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* Printable Institutional Attendance Modal View */}
      {/* ========================================================================= */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-surface text-text rounded-2xl max-w-4xl w-full p-8 space-y-6 shadow-2xl border border-v-border printable-area">
            {/* Print Header */}
            <div className="flex items-center justify-between border-b border-v-border pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={COLLEGE_LOGO_PATH}
                  alt={COLLEGE_SHORT_NAME}
                  className="w-16 h-16 object-contain"
                />
                <div>
                  <h2 className="t-title font-bold tracking-tight text-text">
                    {COLLEGE_NAME}
                  </h2>
                  <p className="t-small text-text-muted font-medium">
                    Attendance Ledger Report •{" "}
                    {new Date().toLocaleDateString(undefined, {
                      dateStyle: "long",
                    })}
                  </p>
                  <p className="t-small text-text-faint">
                    Degree:{" "}
                    <strong className="text-text">
                      {selectedDegree === "all"
                        ? "All Degrees"
                        : selectedDegree}
                    </strong>{" "}
                    | Department:{" "}
                    <strong className="text-text">
                      {selectedDept === "all"
                        ? "All Departments"
                        : selectedDept}
                    </strong>{" "}
                    | Year:{" "}
                    <strong className="text-text">
                      {selectedYear === "all" ? "All Years" : `Year ${selectedYear}`}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 no-print">
                <Button
                  onClick={() => window.print()}
                  className="bg-primary hover:bg-primary-600 text-white t-small font-semibold gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" strokeWidth={1.75} /> Print Sheet
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="h-8 w-8 text-text-muted hover:text-text border-v-border cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>

            {/* Print Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-v-border">
                <thead className="bg-bg-page border-b border-v-border text-text font-semibold uppercase t-eyebrow">
                  <tr>
                    <th className="p-2 border-r border-v-border">#</th>
                    <th className="p-2 border-r border-v-border">ID Code</th>
                    <th className="p-2 border-r border-v-border">Name</th>
                    <th className="p-2 border-r border-v-border">
                      Degree & Dept
                    </th>
                    <th className="p-2 border-r border-v-border">Year</th>
                    <th className="p-2 border-r border-v-border">Event</th>
                    <th className="p-2 border-r border-v-border">
                      Date & Time
                    </th>
                    <th className="p-2">Camera</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v-border">
                  {filteredRecords.slice(0, 100).map((r, idx) => {
                    const p = personMap.get(r.person_id);
                    const pYear = r.year ?? p?.year;
                    return (
                      <tr key={r.id}>
                        <td className="p-2 border-r border-v-border font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="p-2 border-r border-v-border font-mono">
                          {r.person_code}
                        </td>
                        <td className="p-2 border-r border-v-border font-medium text-text">
                          {r.person_name}
                        </td>
                        <td className="p-2 border-r border-v-border font-mono">
                          {formatProgram(
                            r.degree || p?.degree,
                            r.department || p?.department,
                          )}
                        </td>
                        <td className="p-2 border-r border-v-border font-mono">
                          {pYear ? `Yr ${pYear}` : "—"}
                        </td>
                        <td className="p-2 border-r border-v-border font-semibold uppercase text-[10px]">
                          {r.kind === "check_in" ? "Check-In" : "Check-Out"}
                        </td>
                        <td className="p-2 border-r border-v-border font-mono tabular-nums">
                          {r.date} {formatTime(r.timestamp)}
                        </td>
                        <td className="p-2 font-mono text-[10px]">
                          {r.camera_id}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRecords.length > 100 && (
                <p className="t-small text-text-muted mt-2 text-center">
                  Showing first 100 entries of {filteredRecords.length}. Export
                  CSV/Excel for full dataset.
                </p>
              )}
            </div>

            {/* Print Footer */}
            <div className="flex justify-between items-center t-small text-text-muted pt-4 border-t border-v-border">
              <span>
                Total Entries Printed: {Math.min(filteredRecords.length, 100)}
              </span>
              <span>
                Generated by {COLLEGE_SHORT_NAME} Face Attendance System
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
