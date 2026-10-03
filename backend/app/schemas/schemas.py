from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    degree: str | None = None
    department: str | None = None
    year: int | None = None
    active: bool = True
    created_at: datetime


class PersonUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    degree: str | None = Field(None, max_length=32)
    department: str | None = Field(None, max_length=64)
    year: int | None = Field(None, ge=1, le=4)
    active: bool | None = None


class RejectedImage(BaseModel):
    index: int
    reasons: list[str]


class RegisterResponse(BaseModel):
    person: PersonOut
    accepted_images: int
    rejected_images: list[RejectedImage] = []


class FaceResult(BaseModel):
    bbox: list[float]
    person_id: int | None
    name: str
    score: float
    status: str
    marked: str | None = None


class RecognizeResponse(BaseModel):
    faces: list[FaceResult]


class AttendanceOut(BaseModel):
    id: int
    person_id: int
    person_code: str
    person_name: str
    degree: str | None = None
    department: str | None = None
    year: int | None = None
    kind: str
    timestamp: datetime
    date: date
    camera_id: str
    confidence: float
    snapshot_path: str | None = None


class HealthOut(BaseModel):
    status: str
    database: bool
    redis: bool
    models_loaded: bool
    gallery_size: int
    persons: int = 0
    college: str = "NSCET"


class CameraSettingItem(BaseModel):
    id: str
    name: str = "Camera"
    url: str = ""
    mode: str = "auto"


class SettingsData(BaseModel):
    match_threshold: float = 0.45
    duplicate_threshold: float = 0.65
    confirm_frames: int = 3
    attendance_cooldown_s: int = 300
    min_checkout_gap_min: int = 60
    late_cutoff: str = "09:15"
    default_mode: str = "auto"
    cameras: list[CameraSettingItem] = []


# --- Authentication Schemas ---
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    role: str
    active: bool
    created_at: datetime


class UserLogin(BaseModel):
    email: str = Field(..., description="College email (@nscet.edu.in)")
    password: str = Field(..., min_length=4)


class UserCreate(BaseModel):
    email: str
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=1, max_length=128)
    role: str = Field("faculty", pattern="^(admin|faculty)$")


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CollegeInfoOut(BaseModel):
    college_name: str
    short_name: str
    location: str
    logo_path: str
    page_title: str
    programs: dict[str, list[str]]
    processes: list[dict[str, str]]
    colors: dict[str, str]
