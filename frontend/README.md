# Face Attendance System — Frontend Dashboard

A modern, high-performance biometric attendance web application built with **React 19**, **Vite 8**, **Tailwind CSS v4**, and **TanStack Router**. The frontend communicates seamlessly with the FastAPI backend engine to deliver real-time face recognition, attendance logs, and staff enrollment.

---

## 🚀 Key Features & Modules

### 1. 📸 Live Biometric Face Scanner (`ScannerView.tsx`)
- **Real-Time Webcam Streaming**: Directly accesses laptop or USB webcams via `navigator.mediaDevices.getUserMedia`.
- **Canvas Bounding Box HUD**: Renders real-time bounding boxes around detected faces with:
  - Full Name & Match Confidence Percentage (e.g. `Arun Kumar • 88%`).
  - Attendance Status Badges (`CHECKED IN ✓` or `CHECKED OUT ↷`).
  - Sci-fi laser scanning radar line and glowing corner brackets.
- **Audio Chime**: Synthesized chime generated via the browser's Web Audio API on successful attendance confirmation.
- **Flexible Modes**: Toggle between **Auto-Scan Stream** and **Manual Scan**, or upload image files directly.

### 2. 📊 Attendance Logs & Analytics (`AttendanceView.tsx`)
- **KPI Summary Cards**: Real-time counts of Total Events, Check-Ins, Check-Outs, and Unique Personnel Sighted.
- **Dynamic Search & Filters**: Search by staff name, employee ID, or department. Filter by event type (`All`, `Check-In`, `Check-Out`) and date.
- **One-Click Export**: Direct downloads for **CSV** and **Excel (.xlsx)** formats.

### 3. 👥 Personnel & Biometric Registry (`PersonnelView.tsx`)
- **Identity Directory**: Grid cards of enrolled personnel showing their ID code, name, department, status, and registration date.
- **Enrollment Wizard**:
  - Register new employees with ID code, full name, and department.
  - Multi-image upload or webcam photo snapshot burst for ArcFace 512-D gallery training.
  - Real-time quality verification feedback.

### 4. 📹 CCTV & Camera Streams (`CamerasView.tsx`)
- **Multi-Channel Feeds**: Overview of all configured RTSP / CCTV entrance channels (`cam0`, gate, reception).
- **Background Worker Status**: Clear commands and indicators for continuous background multi-camera tracking.

### 5. ⚙️ System Settings & Diagnostics (`SettingsModal.tsx`)
- **Live Diagnostics**: Database connection status, Redis / in-memory KV state, AI engine readiness, and active vector gallery size.
- **API Key Configuration**: Manage the `X-API-Key` authentication header with local storage persistence.

---

## 🛠 Tech Stack

- **Core Framework**: React 19 + TypeScript
- **Build Tool**: Vite 8 with HMR & TSConfig path resolution (`@/*`)
- **Routing**: `@tanstack/react-router` (Type-safe file-based router)
- **State & Data Fetching**: `@tanstack/react-query`
- **Styling**: Tailwind CSS v4 + PostCSS with customized dark luxury color tokens
- **UI Primitives**: Radix UI (`@radix-ui/*`)
- **Icons**: Lucide React (`lucide-react`)
- **Animations**: CSS keyframe laser sweep & glowing HUD brackets

---

## 📁 Directory Structure

```
frontend/
├── public/                       # Static public assets (favicons, manifest)
├── src/
│   ├── assets/                   # Logos, static graphics
│   ├── components/               # Core application modules
│   │   ├── ScannerView.tsx       # Live Webcam biometric scanner workstation
│   │   ├── AttendanceView.tsx    # Attendance logs, filters & CSV/Excel export
│   │   ├── PersonnelView.tsx     # Personnel cards & enrollment wizard
│   │   ├── CamerasView.tsx       # CCTV / RTSP stream monitor
│   │   ├── SettingsModal.tsx     # System diagnostics & API key configuration
│   │   └── ui/                   # Reusable UI primitives (Button, Card, Badge, etc.)
│   ├── lib/
│   │   ├── api.ts                # Typed API client for FastAPI backend endpoints
│   │   └── utils.ts              # ClassName merge utilities (clsx + tailwind-merge)
│   ├── routes/
│   │   ├── __root.tsx            # TanStack root layout & HTML provider
│   │   └── index.tsx             # Main dashboard tab controller
│   ├── styles.css                # Tailwind CSS v4 directives & scanning animations
│   ├── vite-env.d.ts             # Vite client TypeScript definitions
│   └── main.tsx                  # React DOM mount entry point
├── index.html                    # Single-page HTML shell
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript compiler configuration
└── vite.config.ts                # Vite config with backend proxy (/api -> :8000)
```

---

## 🚦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```
The app will launch at **`http://localhost:5173/`**.

> **Note**: Vite is configured with a built-in proxy in `vite.config.ts`. All `/api/*` network requests are automatically forwarded to the backend running at `http://127.0.0.1:8000`.

### 3. Production Build & Preview
```bash
# Build production bundle to dist/
npm run build

# Preview the production build locally
npm run preview
```

### 4. Running Unit Tests
```bash
npm test
```

---

## 🔗 Backend Connection & API Proxy

The frontend communicates with the FastAPI backend through the client in `src/lib/api.ts`.
In development, `vite.config.ts` proxies all `/api` requests to port `8000`:

```ts
server: {
  port: 5173,
  proxy: {
    "/api": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api/, ""),
    },
  },
}
```

Authentication is handled via the `X-API-Key` header (default: `change-me-please`, configurable in the UI Settings modal).
