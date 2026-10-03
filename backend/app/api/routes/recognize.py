from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_container, require_kiosk_or_auth
from app.schemas.schemas import RecognizeResponse
from app.services.container import Container
from app.utils.image import decode_image

router = APIRouter(tags=["recognition"], dependencies=[Depends(require_kiosk_or_auth)])


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize(
    file: UploadFile = File(...),
    mark: bool = False,
    camera_id: str = "webcam_kiosk",
    c: Container = Depends(get_container),
):
    try:
        content = await file.read()
        img = decode_image(content)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Could not process image. Please ensure the camera is sending a clear JPEG/PNG frame.",
        )

    faces = await run_in_threadpool(c.recognition.recognize, img, camera_id, mark)
    return RecognizeResponse(faces=faces)
