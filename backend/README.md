# Face Attendance System — Backend AI Engine & API

A high-performance Python backend powered by **FastAPI**, **YOLO11s-face**, **InsightFace (ArcFace 512-D)**, and **SQLAlchemy** for real-time facial biometric detection, recognition, and attendance logging.

---

## 🚀 Key Responsibilities

1. **Face Detection**: YOLO11s-face anchor-free detector (with MTCNN / MediaPipe fallbacks) operating at `640px` resolution with confidence threshold `0.5`.
2. **Landmark Alignment & Normalization**: MediaPipe 5-point facial landmark detection and affine similarity transform warping to canonical `112×112` ArcFace dimension.
3. **Deep Feature Embedding**: InsightFace `buffalo_l` (w600k_r50 backbone) extracting L2-normalized 512-dimensional vectors.
4. **Vector Gallery Search**: Fast Cosine Similarity matching against registered identities in memory using NumPy dot products or optional FAISS indexing (`match_threshold = 0.45`).
5. **Multi-Face Tracking**: IoU-based bounding box tracker across consecutive video frames requiring `3` consecutive matching frames before marking attendance.
6. **Anti-Duplicate Cooldown**: Redis / in-memory KV cache with a 300-second cooldown key to prevent duplicate attendance logs.
7. **REST & WebSocket Streaming**: FastAPI endpoints for registration, recognition, attendance logs, and real-time CCTV stream broadcasting.

---

## 📁 Directory Structure

```
backend/
├── app/
│   ├── alignment/                # 5-point landmark similarity transform & FaceMesh
│   ├── api/                      # FastAPI router endpoints
│   │   ├── routes/
│   │   │   ├── attendance.py     # Attendance queries, stats & CSV/Excel export
│   │   │   ├── health.py         # System health diagnostics endpoint
│   │   │   ├── persons.py        # Staff registration, update & delete
│   │   │   ├── recognize.py      # Face recognition endpoint
│   │   │   └── stream.py         # RTSP camera frames & WebSocket streaming
│   │   └── main.py               # FastAPI application factory & lifespan
│   ├── core/                     # Settings (config.yaml < .env), logging & types
│   ├── db/                       # SQLAlchemy models, SQLite/Postgres session & repository
│   ├── detection/                # YOLO11s-face, MTCNN & MediaPipe detector wrappers
│   ├── liveness/                 # Passive EAR (Eye Aspect Ratio) blink detector
│   ├── recognition/              # ArcFace embedder, vector gallery & cosine matcher
│   ├── schemas/                  # Pydantic validation schemas
│   ├── services/                 # Business logic (attendance, registration, recognition)
│   ├── tracking/                 # IoU multi-face tracker across frames
│   ├── utils/                    # Image decoding, CLAHE, metrics & KV cache abstraction
│   ├── video/                    # OpenCV RTSP / webcam frame capture pipelines
│   └── worker.py                 # Multi-camera background worker process
├── models/                       # Downloaded model weights
│   ├── insightface/              # ArcFace buffalo_l models
│   └── yolov11s-face.pt          # YOLO11s face detection weights
├── scripts/                      # Utility scripts (seed_data, download_models, evaluate)
├── tests/                        # Automated unit & integration tests
├── alembic/                      # Database migrations
├── alembic.ini                   # Alembic configuration
├── config.yaml                   # Backend default configurations
├── requirements.txt              # Python package dependencies
└── .env                          # Local environment variables
```

---

## 🚦 Getting Started

### 1. Set Up Virtual Environment & Dependencies
```bash
# In the project root or backend folder:
..\.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Download AI Model Weights (One-Time)
```bash
python scripts/download_models.py
```
Downloads `yolov11s-face.pt` and the InsightFace `buffalo_l` bundle.

### 3. Run the FastAPI Server
```bash
# From backend directory:
python -m uvicorn app.api.main:get_app --factory --reload --port 8000
```
API Documentation (Swagger UI) is available at: **`http://127.0.0.1:8000/docs`**.

### 4. Run the Background CCTV Camera Worker
```bash
python -m app.worker
```

### 5. Run Backend Tests
```bash
pytest -q
```

---

## 🔑 Key Configuration Options (`config.yaml` / `.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./db/attendance.db` | Database connection string (SQLite or PostgreSQL) |
| `REDIS_URL` | `redis://localhost:6379/0` | Cache & live frame broadcasting (falls back to in-memory KV) |
| `API_KEY` | `change-me-please` | Secret header required for `/persons`, `/recognize`, and `/attendance` |
| `MATCH_THRESHOLD` | `0.45` | Cosine similarity cutoff to accept a face match |
| `DUPLICATE_THRESHOLD` | `0.65` | Registration rejection threshold if face is already enrolled |
| `CONFIRM_FRAMES` | `3` | Consecutive matching frames required before marking attendance |
| `ATTENDANCE_COOLDOWN_S` | `300` | Cooldown period in seconds before logging the same person again |
| `MIN_CHECKOUT_GAP_MIN` | `60` | Minimum minutes between check-in and check-out in `auto` mode |
