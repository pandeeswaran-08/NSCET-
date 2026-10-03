/**
 * Nadar Saraswathi College of Engineering and Technology (NSCET)
 * Face Attendance API Client
 */

export interface Person {
  id: number;
  code: string;
  name: string;
  degree: string | null;
  department: string | null;
  year?: number | null;
  active: boolean;
  created_at: string;
  face_count?: number;
}

export interface AttendanceRecord {
  id: number;
  person_id: number;
  person_code: string;
  person_name: string;
  degree?: string | null;
  department?: string | null;
  year?: number | null;
  kind: "check_in" | "check_out";
  timestamp: string;
  date: string;
  camera_id: string;
  confidence: number;
  snapshot_path: string | null;
}

export interface FaceResult {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  person_id: number | null;
  name: string;
  score: number;
  status: "match" | "unknown" | "duplicate" | string;
  marked: "check_in" | "check_out" | null;
}

export interface RecognizeResponse {
  faces: FaceResult[];
}

export interface HealthStatus {
  status: string;
  database: boolean;
  redis: boolean;
  models_loaded: boolean;
  gallery_size: number;
  college?: string;
}

export interface DailyCount {
  date: string;
  present: number;
}

export interface CameraInfo {
  id: string;
  enabled: boolean;
  mode: string;
}

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "faculty";
  active: boolean;
  created_at: string;
}

export type UserInfo = UserProfile;

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

const TOKEN_STORAGE_KEY = "nscet_attendance_jwt";
const USER_STORAGE_KEY = "nscet_attendance_user";
const KIOSK_TOKEN_KEY = "nscet_kiosk_token";
const DEFAULT_KIOSK_TOKEN = "nscet-kiosk-live-token-secret";

export function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  return null;
}

export function setAuthToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

export function removeAuthToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

export function getStoredUser(): UserProfile | null {
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setStoredUser(user: UserProfile): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
}

export function getKioskToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem(KIOSK_TOKEN_KEY) || DEFAULT_KIOSK_TOKEN;
  }
  return DEFAULT_KIOSK_TOKEN;
}

export function setKioskToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(KIOSK_TOKEN_KEY, token);
  }
}

export const getApiKey = getKioskToken;
export const setApiKey = setKioskToken;

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const kioskToken = getKioskToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Supply kiosk credentials for camera recognition
  if (!headers.has("X-Kiosk-Token")) {
    headers.set("X-Kiosk-Token", kioskToken);
  }

  const url = endpoint.startsWith("/api") ? endpoint : `/api${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Error ${response.status}: ${response.statusText}`;
    try {
      const json = await response.json();
      if (json.detail) {
        errorDetail =
          typeof json.detail === "string"
            ? json.detail
            : JSON.stringify(json.detail);
      }
    } catch {
      // Keep default error text
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Auth
  getCurrentUser: () => getStoredUser(),
  getStoredUser,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  login: async (email: string, password: string) => {
    const res = await request<LoginResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.access_token);
    setStoredUser(res.user);
    return res;
  },

  logout: () => {
    removeAuthToken();
  },

  getMe: () => request<UserProfile>("/auth/me"),

  getCollegeConfig: () => request<any>("/college/config"),

  getHealth: () => request<HealthStatus>("/health"),

  getPersons: (activeOnly = false) =>
    request<Person[]>(`/persons?active_only=${activeOnly}&limit=500`),

  getPerson: (id: number) => request<Person>(`/persons/${id}`),

  updatePerson: (
    id: number,
    data: {
      name?: string;
      degree?: string;
      department?: string;
      year?: number;
      active?: boolean;
    },
  ) =>
    request<Person>(`/persons/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deletePerson: (id: number) =>
    request<void>(`/persons/${id}`, {
      method: "DELETE",
    }),

  registerPerson: async (
    code: string,
    name: string,
    degree: string | undefined,
    department: string | undefined,
    year: number | undefined,
    files: File[],
  ) => {
    const formData = new FormData();
    formData.append("code", code);
    formData.append("name", name);
    if (degree) formData.append("degree", degree);
    if (department) formData.append("department", department);
    if (year) formData.append("year", year.toString());
    files.forEach((file) => {
      formData.append("files", file);
    });

    return request<{
      person: Person;
      accepted_images: number;
      rejected_images: Array<{ index: number; reasons: string[] }>;
    }>("/persons/register", {
      method: "POST",
      body: formData,
    });
  },

  createPersonWithPhotos: async (params: {
    code: string;
    name: string;
    degree?: string;
    department?: string;
    year?: number;
    files: File[];
  }) => {
    const res = await api.registerPerson(
      params.code,
      params.name,
      params.degree,
      params.department,
      params.year,
      params.files,
    );
    return {
      ...res.person,
      accepted_images: res.accepted_images,
      enrolled_images_count: res.accepted_images,
      rejected_images: res.rejected_images,
    };
  },

  recognize: async (
    imageBlob: Blob,
    mark = true,
    cameraId = "webcam_scanner",
  ) => {
    const formData = new FormData();
    formData.append("file", imageBlob, "frame.jpg");
    return request<RecognizeResponse>(
      `/recognize?mark=${mark}&camera_id=${encodeURIComponent(cameraId)}`,
      {
        method: "POST",
        body: formData,
      },
    );
  },

  getAttendance: (params?: {
    start?: string;
    end?: string;
    personId?: number;
    cameraId?: string;
    kind?: "check_in" | "check_out";
    degree?: string;
    department?: string;
    year?: number;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.start) q.append("start", params.start);
    if (params?.end) q.append("end", params.end);
    if (params?.personId) q.append("person_id", params.personId.toString());
    if (params?.cameraId) q.append("camera_id", params.cameraId);
    if (params?.kind) q.append("kind", params.kind);
    if (params?.degree) q.append("degree", params.degree);
    if (params?.department) q.append("department", params.department);
    if (params?.year) q.append("year", params.year.toString());
    if (params?.limit) q.append("limit", params.limit.toString());
    if (params?.offset) q.append("offset", params.offset.toString());

    return request<AttendanceRecord[]>(`/attendance?${q.toString()}`);
  },

  getDailyCounts: (
    start: string,
    end: string,
    degree?: string,
    department?: string,
    year?: number,
  ) => {
    const q = new URLSearchParams();
    q.append("start", start);
    q.append("end", end);
    if (degree) q.append("degree", degree);
    if (department) q.append("department", department);
    if (year) q.append("year", year.toString());
    return request<DailyCount[]>(`/attendance/daily-counts?${q.toString()}`);
  },

  getCameras: () => request<CameraInfo[]>("/cameras"),

  getStreamFrameUrl: (cameraId: string) => {
    const token = getAuthToken();
    const apiKey = getApiKey();
    const authParam = token
      ? `token=${encodeURIComponent(token)}`
      : apiKey
        ? `api_key=${encodeURIComponent(apiKey)}`
        : "";
    return `/api/stream/${encodeURIComponent(cameraId)}/frame?${authParam}&t=${Date.now()}`;
  },

  getStreamWsUrl: (cameraId: string, includeFrame = true) => {
    if (typeof window === "undefined") return "";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const token = getAuthToken();
    const apiKey = getApiKey();
    const authParam = token
      ? `token=${encodeURIComponent(token)}`
      : apiKey
        ? `api_key=${encodeURIComponent(apiKey)}`
        : "";
    return `${proto}//${host}/api/stream/${encodeURIComponent(cameraId)}?${authParam}&include_frame=${includeFrame}`;
  },

  getExportUrl: (
    format: "csv" | "xlsx",
    params?: {
      start?: string;
      end?: string;
      personId?: number;
      cameraId?: string;
      kind?: string;
      date_from?: string;
      date_to?: string;
      degree?: string;
      department?: string;
      year?: number;
    },
  ) => {
    const q = new URLSearchParams();
    q.append("format", format);
    if (params?.start) q.append("start", params.start);
    if (params?.end) q.append("end", params.end);
    if (params?.personId) q.append("person_id", params.personId.toString());
    if (params?.cameraId) q.append("camera_id", params.cameraId);
    if (params?.kind) q.append("kind", params.kind);
    if (params?.date_from) q.append("date_from", params.date_from);
    if (params?.date_to) q.append("date_to", params.date_to);
    if (params?.degree) q.append("degree", params.degree);
    if (params?.department) q.append("department", params.department);
    if (params?.year) q.append("year", params.year.toString());
    return `/api/attendance/export?${q.toString()}`;
  },
};
