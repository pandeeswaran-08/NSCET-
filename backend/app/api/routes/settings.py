from __future__ import annotations

import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from app.api.deps import get_container
from app.core.config import CameraConfig
from app.schemas.schemas import SettingsData
from app.services.container import Container

router = APIRouter(tags=["settings"])

_SETTINGS_FILE = Path("db/settings.json")


def _read_persistent_settings() -> dict:
    if _SETTINGS_FILE.exists():
        try:
            return json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Could not read settings file: {e}")
    return {}


def _write_persistent_settings(data: dict) -> None:
    try:
        _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Could not write settings file: {e}")


@router.get("/settings", response_model=SettingsData)
def get_settings_data(c: Container = Depends(get_container)):
    persisted = _read_persistent_settings()
    cams = []
    if "cameras" in persisted and isinstance(persisted["cameras"], list) and persisted["cameras"]:
        cams = persisted["cameras"]
    elif c.settings.cameras:
        cams = [
            {"id": cam.id, "name": f"Camera {cam.id.upper()}", "url": cam.source, "mode": cam.mode}
            for cam in c.settings.cameras
        ]
    else:
        cams = [
            {"id": "cam-kiosk-1", "name": "Main Entrance Kiosk", "url": "0", "mode": "auto"},
            {"id": "cam-gate-2", "name": "Campus North Gate RTSP", "url": "rtsp://admin:admin@192.168.1.108:554/h264Preview_01_main", "mode": "check_in"},
        ]

    return SettingsData(
        match_threshold=persisted.get("match_threshold", c.settings.match_threshold),
        duplicate_threshold=persisted.get("duplicate_threshold", c.settings.duplicate_threshold),
        confirm_frames=persisted.get("confirm_frames", c.settings.confirm_frames),
        attendance_cooldown_s=persisted.get("attendance_cooldown_s", c.settings.attendance_cooldown_s),
        min_checkout_gap_min=persisted.get("min_checkout_gap_min", c.settings.min_checkout_gap_min),
        late_cutoff=persisted.get("late_cutoff", "09:15"),
        default_mode=persisted.get("default_mode", "auto"),
        cameras=cams,
    )


@router.put("/settings", response_model=SettingsData)
def update_settings_data(payload: SettingsData, c: Container = Depends(get_container)):
    data = payload.model_dump()
    _write_persistent_settings(data)

    # Apply to in-memory container settings
    c.settings.match_threshold = payload.match_threshold
    c.settings.duplicate_threshold = payload.duplicate_threshold
    c.settings.confirm_frames = payload.confirm_frames
    c.settings.attendance_cooldown_s = payload.attendance_cooldown_s
    c.settings.min_checkout_gap_min = payload.min_checkout_gap_min

    # Update cameras
    new_cams = []
    for cam in payload.cameras:
        new_cams.append(
            CameraConfig(
                id=cam.id,
                source=cam.url,
                enabled=True,
                mode=cam.mode if cam.mode in ("auto", "check_in", "check_out") else "auto",
            )
        )
    c.settings.cameras = new_cams

    logger.info("System settings updated and persisted successfully")
    return payload


@router.post("/gallery/rebuild")
def rebuild_gallery(c: Container = Depends(get_container)):
    try:
        c.gallery.rebuild()
        persons_count = c.repo.count_persons()
        return {
            "status": "ok",
            "message": "Face vector gallery rebuilt successfully",
            "gallery_size": c.gallery.size,
            "persons": persons_count,
        }
    except Exception as exc:
        logger.error(f"Gallery rebuild error: {exc}")
        raise HTTPException(500, f"Gallery rebuild failed: {exc}")
