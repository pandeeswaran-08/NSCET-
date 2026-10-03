/**
 * College branding configuration, degree & department taxonomy, and standardized system processes.
 * Single source of truth for NSCET Face Attendance.
 */

export const COLLEGE_CONFIG = {
  name: "Nadar Saraswathi College of Engineering and Technology, Theni",
  shortName: "NSCET",
  location: "Theni, Tamil Nadu, India",
  logoPath: "/assets/college-logo.png",
  pageTitle:
    "Nadar Saraswathi College of Engineering and Technology — Face Attendance",
  allowedEmailDomain: "nscet.edu.in",
  themeColors: {
    primary: "var(--primary)",
    primaryDark: "var(--primary-600)",
    accent: "var(--primary)",
    accentHover: "var(--primary-600)",
  },
} as const;

export const COLLEGE_NAME = COLLEGE_CONFIG.name;
export const COLLEGE_SHORT_NAME = COLLEGE_CONFIG.shortName;
export const COLLEGE_LOGO_PATH = COLLEGE_CONFIG.logoPath;

export type DegreeType = "BE" | "B.Tech";

export const COLLEGE_PROGRAMS: Record<string, string[]> = {
  BE: ["CSE", "CIVIL", "MECH", "ECE", "EEE"],
  "B.Tech": ["IT", "AIDS"],
};

export const DEGREE_OPTIONS: DegreeType[] = ["BE", "B.Tech"];
export const DEGREES = DEGREE_OPTIONS;

export const ACADEMIC_YEARS = [
  { value: 1, label: "1st Year", short: "1st Yr", roman: "I Year" },
  { value: 2, label: "2nd Year", short: "2nd Yr", roman: "II Year" },
  { value: 3, label: "3rd Year", short: "3rd Yr", roman: "III Year" },
  { value: 4, label: "4th Year", short: "4th Yr", roman: "IV Year (Final)" },
] as const;

export const YEAR_OPTIONS = [1, 2, 3, 4] as const;
export type AcademicYear = (typeof YEAR_OPTIONS)[number];

export function getDepartmentsForDegree(degree?: string | null): string[] {
  if (!degree) return [];
  return COLLEGE_PROGRAMS[degree] || [];
}

export function formatYear(year?: number | null): string {
  if (!year) return "—";
  const found = ACADEMIC_YEARS.find((y) => y.value === year);
  return found ? found.label : `Year ${year}`;
}

export function formatProgram(
  degree?: string | null,
  department?: string | null,
  year?: number | null,
): string {
  const parts: string[] = [];
  if (degree && department) {
    parts.push(`${degree} – ${department}`);
  } else if (department || degree) {
    parts.push(department || degree || "");
  }
  if (year) {
    const yrObj = ACADEMIC_YEARS.find((y) => y.value === year);
    parts.push(yrObj ? yrObj.short : `Yr ${year}`);
  }
  return parts.length > 0 ? parts.join(" • ") : "—";
}

/**
 * Standardized, plain-language process descriptions.
 * Rule: format "<Process Name> — <function>"
 */
export interface SystemProcess {
  name: string;
  description: string;
  function: string;
  label: string;
}

export const SYSTEM_PROCESSES: SystemProcess[] = [
  {
    name: "Face Detection",
    description: "finds faces in the camera frame",
    function: "finds faces in the camera frame",
    label: "Face Detection — finds faces in the camera frame",
  },
  {
    name: "Face Alignment & Quality Check",
    description:
      "straightens the face and rejects blurry, dark, or tilted images",
    function: "straightens the face and rejects blurry, dark, or tilted images",
    label:
      "Face Alignment & Quality Check — straightens the face and rejects blurry, dark, or tilted images",
  },
  {
    name: "Face Recognition",
    description: "matches the face with enrolled identities",
    function: "matches the face with enrolled identities",
    label: "Face Recognition — matches the face with enrolled identities",
  },
  {
    name: "Face Tracking & Confirmation",
    description: "confirms identity across consecutive frames",
    function: "confirms identity across consecutive frames",
    label:
      "Face Tracking & Confirmation — confirms identity across consecutive frames",
  },
  {
    name: "Liveness Check",
    description: "verifies a real person using blink detection",
    function: "verifies a real person using blink detection",
    label: "Liveness Check — verifies a real person using blink detection",
  },
  {
    name: "Duplicate Entry Guard",
    description: "prevents repeated attendance within the cooldown time",
    function: "prevents repeated attendance within the cooldown time",
    label:
      "Duplicate Entry Guard — prevents repeated attendance within the cooldown time",
  },
  {
    name: "Attendance Marking",
    description: "records check-in and check-out automatically",
    function: "records check-in and check-out automatically",
    label: "Attendance Marking — records check-in and check-out automatically",
  },
  {
    name: "Duplicate Enrollment Check",
    description: "stops the same person being registered twice",
    function: "stops the same person being registered twice",
    label:
      "Duplicate Enrollment Check — stops the same person being registered twice",
  },
  {
    name: "Biometric Vault Encryption",
    description: "encrypts facial vectors at rest and in transit via AES-256-GCM",
    function: "encrypts facial vectors at rest and in transit via AES-256-GCM",
    label:
      "Biometric Vault Encryption — encrypts facial vectors at rest and in transit via AES-256-GCM",
  },
];
