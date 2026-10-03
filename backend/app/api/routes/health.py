from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.core.college import COLLEGE_BRANDING_METADATA
from app.schemas.schemas import CollegeInfoOut, HealthOut
from app.services.container import Container

router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthOut)
def health(c: Container = Depends(get_container)):
    db, redis = c.repo.ping(), c.kv.ping()
    persons_count = c.repo.count_persons() if db else 0
    return HealthOut(
        status="ok" if db else "degraded",
        database=db,
        redis=redis,
        models_loaded=c.models_loaded,
        gallery_size=c.gallery.size,
        persons=persons_count,
        college="NSCET",
    )


@router.get("/college/config", response_model=CollegeInfoOut)
def college_config():
    """Returns institutional branding, academic programs, and process definitions."""
    return CollegeInfoOut(**COLLEGE_BRANDING_METADATA)
