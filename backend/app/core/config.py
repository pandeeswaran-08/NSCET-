"""Application settings: YAML defaults < .env < environment variables."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    YamlConfigSettingsSource,
)


class CameraConfig(BaseModel):
    id: str
    source: str
    enabled: bool = True
    mode: Literal["auto", "check_in", "check_out"] = "auto"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        yaml_file=os.getenv("CONFIG_FILE", "config.yaml"),
        extra="ignore",
        case_sensitive=False,
    )

    # general & college branding
    app_name: str = "Nadar Saraswathi College of Engineering and Technology — Face Attendance"
    app_env: str = "dev"
    log_level: str = "INFO"
    log_json: bool = False
    api_key: str = "change-me-please"
    timezone: str = "Asia/Kolkata"

    # college authentication & domain enforcement
    allowed_email_domain: str = "nscet.edu.in"
    jwt_secret: str = "nscet-secret-jwt-attendance-key-2026"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    kiosk_token: str = "nscet-kiosk-live-token-secret"
    biometric_encryption_key: str = "nscet-biometric-aes-256-gcm-master-key-2026"
    enable_biometric_encryption: bool = True

    # storage
    database_url: str = "sqlite:///./db/attendance.db"
    redis_url: str | None = None
    snapshots_dir: str = "db/snapshots"
    raw_dir: str = "db/raw"
    store_snapshots: bool = True
    store_raw_images: bool = False
    retention_days: int = 365

    # models
    detector: Literal["yolo", "mtcnn", "mediapipe"] = "yolo"
    yolo_weights: str = "models/yolov11s-face.pt"
    detector_conf: float = 0.5
    detector_imgsz: int = 640
    device: str = "auto"
    models_dir: str = "models"
    insightface_model: str = "buffalo_l"
    use_landmarks: bool = True
    use_faiss: bool = False
    low_light_threshold: float = 70.0

    @property
    def effective_database_url(self) -> str:
        from pathlib import Path
        if self.database_url.startswith("sqlite:///"):
            raw_path = self.database_url.replace("sqlite:///", "")
            p = Path(raw_path)
            if p.is_absolute():
                return f"sqlite:///{p.as_posix()}"
            if p.exists():
                return f"sqlite:///{p.resolve().as_posix()}"
            # Only search for fallback paths if using standard relative path
            if raw_path in ("./db/attendance.db", "db/attendance.db"):
                candidates = [
                    Path("db/attendance.db"),
                    Path("../db/attendance.db"),
                    Path("backend/db/attendance.db"),
                    Path("attendance.db"),
                    Path("data/attendance.db"),
                    Path("../data/attendance.db"),
                ]
                for cand in candidates:
                    if cand.exists():
                        return f"sqlite:///{cand.resolve().as_posix()}"
        return self.database_url

    # recognition
    match_threshold: float = 0.45
    duplicate_threshold: float = 0.65
    confirm_frames: int = 3
    frame_skip: int = 2
    track_iou: float = 0.3
    track_max_age: int = 15

    # liveness & anti-spoofing
    liveness_enabled: bool = False
    anti_spoof_enabled: bool = False
    spoof_threshold: float = 0.55
    ear_threshold: float = 0.21

    # registration quality
    min_images: int = 3
    max_images: int = 10
    min_face_px: int = 60
    blur_threshold: float = 25.0
    max_yaw: float = 0.55
    max_roll_deg: float = 35.0

    # attendance
    attendance_cooldown_s: int = 300
    min_checkout_gap_min: int = 60

    # cameras / worker
    cameras: list[CameraConfig] = []
    jpeg_quality: int = 70

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            YamlConfigSettingsSource(settings_cls),
            file_secret_settings,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
