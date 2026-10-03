from __future__ import annotations

import asyncio
import base64
import json
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect

from app.api.deps import get_container
from app.core.security import decode_access_token
from app.services.container import Container

router = APIRouter(tags=["stream"])


def verify_stream_auth(
    token: str | None = Query(None),
    api_key: str | None = Query(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    auth_header: str | None = Header(None, alias="Authorization"),
    c: Container = Depends(get_container),
) -> None:
    """Validate streaming requests via query param (for img tags/websockets) or headers."""
    # 1. API key match (query or header)
    for key in (api_key, x_api_key):
        if key and (
            secrets.compare_digest(key, c.settings.api_key)
            or secrets.compare_digest(key, c.settings.kiosk_token)
        ):
            return

    # 2. JWT token match (query or Bearer header)
    jwt_str = token
    if not jwt_str and auth_header and auth_header.startswith("Bearer "):
        jwt_str = auth_header[7:].strip()

    if jwt_str:
        payload = decode_access_token(
            jwt_str,
            secret_key=c.settings.jwt_secret,
            algorithm=c.settings.jwt_algorithm,
        )
        if payload and "sub" in payload:
            user = c.repo.get_user_by_email(payload["sub"])
            if user and user.active:
                return

    raise HTTPException(401, "Invalid or missing streaming credentials")


@router.get("/cameras", dependencies=[Depends(verify_stream_auth)])
def cameras(c: Container = Depends(get_container)):
    return [{"id": cam.id, "enabled": cam.enabled, "mode": cam.mode} for cam in c.settings.cameras]


@router.get("/stream/{camera_id}/frame", dependencies=[Depends(verify_stream_auth)])
def latest_frame(camera_id: str, c: Container = Depends(get_container)):
    data = c.kv.get(f"frame:{camera_id}")
    if data is None:
        raise HTTPException(404, "No live frame (is the worker running?)")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/stream/{camera_id}/status", dependencies=[Depends(verify_stream_auth)])
def latest_status(camera_id: str, c: Container = Depends(get_container)):
    data = c.kv.get(f"result:{camera_id}")
    if data is None:
        raise HTTPException(404, "No live data (is the worker running?)")
    return json.loads(data)


@router.websocket("/stream/{camera_id}")
async def ws_stream(
    ws: WebSocket,
    camera_id: str,
    api_key: str = Query(""),
    token: str = Query(""),
    include_frame: bool = Query(False),
):
    c: Container = ws.app.state.container
    authenticated = False

    # Check API key or kiosk token
    if api_key and (
        secrets.compare_digest(api_key, c.settings.api_key)
        or secrets.compare_digest(api_key, c.settings.kiosk_token)
    ):
        authenticated = True
    elif token:
        payload = decode_access_token(
            token,
            secret_key=c.settings.jwt_secret,
            algorithm=c.settings.jwt_algorithm,
        )
        if payload and "sub" in payload:
            user = c.repo.get_user_by_email(payload["sub"])
            if user and user.active:
                authenticated = True

    if not authenticated:
        await ws.close(code=1008)
        return

    await ws.accept()
    last_ts = None
    try:
        while True:
            raw = await asyncio.to_thread(c.kv.get, f"result:{camera_id}")
            if raw:
                data = json.loads(raw)
                if data.get("ts") != last_ts:
                    last_ts = data.get("ts")
                    if include_frame:
                        jpg = await asyncio.to_thread(c.kv.get, f"frame:{camera_id}")
                        data["frame_b64"] = base64.b64encode(jpg).decode() if jpg else None
                    await ws.send_json(data)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        return
